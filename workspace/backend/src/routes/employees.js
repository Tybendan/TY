import { Router } from 'express';
import db from '../db.js';
import { syncAllForEmployee } from '../feishu-sync.js';

const router = Router();

const SENSITIVE_FIELDS = ['education', 'birth_date', 'id_card', 'ethnicity', 'hukou_address', 'current_address', 'phone', 'emergency_contact', 'marital_status', 'shoe_size', 'clothing_size'];

function isAdmin(req) {
  const token = req.headers['x-admin-token'];
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  return token === password;
}

function stripSensitive(employee) {
  const cleaned = { ...employee };
  for (const f of SENSITIVE_FIELDS) {
    cleaned[f] = undefined;
  }
  return cleaned;
}

router.post('/verify-admin', (req, res) => {
  const { password } = req.body;
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).json({ error: '管理员功能未配置，请设置 ADMIN_PASSWORD 环境变量' });
  if (password === expected) return res.json({ valid: true });
  res.status(401).json({ error: '密码错误' });
});

router.get('/', (req, res) => {
  const all = req.query.all === 'true';
  const stmt = db.prepare(all
    ? 'SELECT * FROM employees ORDER BY created_at DESC'
    : 'SELECT * FROM employees WHERE status = \'active\' ORDER BY created_at DESC'
  );
  const employees = stmt.all();
  res.json(isAdmin(req) ? employees : employees.map(stripSensitive));
});

router.get('/:employeeId', (req, res) => {
  const stmt = db.prepare('SELECT * FROM employees WHERE employee_id = ?');
  const employee = stmt.get(req.params.employeeId);
  if (!employee) return res.status(404).json({ error: '员工不存在' });
  res.json(isAdmin(req) ? employee : stripSensitive(employee));
});

router.post('/', (req, res) => {
  const { employee_id, name, ...rest } = req.body;
  if (!employee_id || !name) {
    return res.status(400).json({ error: '工号和姓名不能为空' });
  }
  try {
    const admin = isAdmin(req);
    const fields = ['employee_id', 'name'];
    const values = [employee_id, name];
    for (const f of SENSITIVE_FIELDS) {
      if (rest[f] !== undefined) {
        if (!admin) return res.status(403).json({ error: `无权设置 ${f} 字段，需要管理员权限` });
        fields.push(f);
        values.push(rest[f]);
      }
    }
    const stmt = db.prepare(`INSERT INTO employees (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`);
    const result = stmt.run(...values);
    const created = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(admin ? created : stripSensitive(created));
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '该工号已存在' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.put('/:employeeId', (req, res) => {
  const { name, status, ...rest } = req.body;
  const admin = isAdmin(req);

  if (name !== undefined) {
    db.prepare('UPDATE employees SET name = ? WHERE employee_id = ?').run(name, req.params.employeeId);
  }

  if (status !== undefined) {
    db.prepare('UPDATE employees SET status = ? WHERE employee_id = ?').run(status, req.params.employeeId);
  }

  for (const f of SENSITIVE_FIELDS) {
    if (rest[f] !== undefined) {
      if (!admin) return res.status(403).json({ error: `无权修改 ${f} 字段，需要管理员权限` });
      db.prepare(`UPDATE employees SET ${f} = ? WHERE employee_id = ?`).run(rest[f], req.params.employeeId);
    }
  }

  const updated = db.prepare('SELECT * FROM employees WHERE employee_id = ?').get(req.params.employeeId);
  if (!updated) return res.status(404).json({ error: '员工不存在' });

  if (status === 'resigned') {
    syncAllForEmployee(req.params.employeeId);
  }

  res.json(admin ? updated : stripSensitive(updated));
});

export default router;
