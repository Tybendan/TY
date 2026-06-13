import db from './db.js';

function checkExpiry(expiryDate) {
  if (!expiryDate) return { expired: false };
  const now = new Date();
  const expiry = new Date(expiryDate);
  const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  return { expired: daysLeft <= 0, daysLeft, warning: daysLeft > 0 && daysLeft <= 30 };
}

let token = null;
let tokenExpiresAt = 0;

async function feishuRequest(path, options = {}) {
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
    return null; // 未配置则静默跳过
  }
  if (!token || Date.now() >= tokenExpiresAt) {
    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: process.env.FEISHU_APP_ID, app_secret: process.env.FEISHU_APP_SECRET }),
    });
    const data = await res.json();
    if (data.code !== 0) {
      console.error('[feishu] token error:', data.msg);
      return null;
    }
    token = data.tenant_access_token;
    tokenExpiresAt = Date.now() + (data.expire - 60) * 1000;
  }
  const res = await fetch(`https://open.feishu.cn/open-apis${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      ...(options.headers || {}),
    },
  });
  const json = await res.json();
  if (json.code !== 0) {
    console.error('[feishu] api error:', path, json.code, json.msg);
    return null;
  }
  return json.data;
}

function mapSkillLevel(rec) {
  const expInfo = checkExpiry(rec.expiry_date);
  const employee = db.prepare('SELECT status FROM employees WHERE employee_id = ?').get(rec.employee_id);
  const isResigned = employee?.status === 'resigned';
  return {
    fields: {
      '工号': rec.employee_id,
      '姓名': rec.employee_name || rec.employee_id,
      '工厂': rec.factory || '',
      '线体': rec.line_name || '',
      '岗位名称': rec.position_name,
      '岗位类型': rec.position_type,
      '技能等级%': rec.skill_level,
      '考核通过日期': rec.effective_date ? new Date(rec.effective_date).getTime() : null,
      '有效期至': rec.expiry_date ? new Date(rec.expiry_date).getTime() : null,
      '连续在岗天数': rec.consecutive_days || 0,
      '离岗天数': rec.away_days || 0,
      '最后在岗日期': rec.last_work_date ? new Date(rec.last_work_date).getTime() : null,
      '状态': isResigned ? '已离职' : expInfo.expired ? '已过期' : expInfo.warning ? '即将过期' : rec.status === 'reset' ? '已归零' : '有效',
    },
  };
}

export async function syncSkillLevel(recordId) {
  const config = getFeishuConfig();
  if (!config) return;

  const rec = db.prepare(`
    SELECT s.*, e.name as employee_name FROM skill_levels s
    LEFT JOIN employees e ON s.employee_id = e.employee_id
    WHERE s.id = ?
  `).get(recordId);
  if (!rec) return;

  const mapped = mapSkillLevel(rec);
  const tableId = config.tableId;

  if (rec.feishu_record_id) {
    await feishuRequest(`/bitable/v1/apps/${config.appToken}/tables/${tableId}/records/${rec.feishu_record_id}`, {
      method: 'PUT',
      body: JSON.stringify(mapped),
    });
  } else {
    const result = await feishuRequest(`/bitable/v1/apps/${config.appToken}/tables/${tableId}/records`, {
      method: 'POST',
      body: JSON.stringify(mapped),
    });
    if (result?.record) {
      db.prepare('UPDATE skill_levels SET feishu_record_id = ? WHERE id = ?')
        .run(result.record.record_id, recordId);
    }
  }
}

export async function deleteFeishuRecord(table, feishuRecordId) {
  const config = getFeishuConfig();
  if (!config || !feishuRecordId) return;
  await feishuRequest(`/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/${feishuRecordId}`, {
    method: 'DELETE',
  });
}

export async function syncAllToFeishu(res) {
  const config = getFeishuConfig();
  if (!config) {
    return res?.json({ error: '飞书未配置，请设置 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_APP_TOKEN / FEISHU_TABLE_ID 环境变量' });
  }

  const records = db.prepare(`
    SELECT s.*, e.name as employee_name FROM skill_levels s
    LEFT JOIN employees e ON s.employee_id = e.employee_id
    WHERE e.status = 'active' OR e.status IS NULL
    ORDER BY s.id
  `).all();

  let synced = 0;
  for (const rec of records) {
    try {
      await syncSkillLevel(rec.id);
      synced++;
    } catch (e) {
      console.error('[feishu] sync error for record', rec.id, e.message);
    }
  }
  if (res) res.json({ message: `已同步 ${synced} 条记录到飞书多维表格` });
  return synced;
}

function getFeishuConfig() {
  const appToken = process.env.FEISHU_APP_TOKEN;
  const tableId = process.env.FEISHU_TABLE_ID;
  if (!appToken || !tableId) return null;
  return { appToken, tableId };
}

export async function syncAllForEmployee(employeeId) {
  const config = getFeishuConfig();
  if (!config) return;

  const records = db.prepare(`
    SELECT s.*, e.name as employee_name FROM skill_levels s
    LEFT JOIN employees e ON s.employee_id = e.employee_id
    WHERE s.employee_id = ?
  `).all(employeeId);

  for (const rec of records) {
    try {
      await syncSkillLevel(rec.id);
    } catch (e) {
      console.error('[feishu] sync error for employee', employeeId, e.message);
    }
  }
}
