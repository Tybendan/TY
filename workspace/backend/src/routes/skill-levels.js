import { Router } from 'express';
import multer from 'multer';
import { extname } from 'path';
import db from '../db.js';
import { recalcAllForEmployee } from '../attendance-calc.js';
import { syncSkillLevel, syncAllToFeishu, deleteFeishuRecord } from '../feishu-sync.js';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const PROMOTION_RULES = {
  '普通岗位': { '25_50': 7, '50_75': 30, '75_100': 60 },
  '重点岗位': { '25_50': 10, '50_75': 30, '75_100': 60 },
};

function calcExpiryDate(effectiveDate, positionType) {
  if (!effectiveDate) return null;
  const d = new Date(effectiveDate);
  d.setMonth(d.getMonth() + (positionType === '重点岗位' ? 6 : 12));
  return d.toISOString().split('T')[0];
}

function checkExpiry(record) {
  if (!record.expiry_date) return { expired: false };
  const now = new Date();
  const expiry = new Date(record.expiry_date);
  const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  return {
    expired: daysLeft <= 0,
    daysLeft,
    expiryDate: record.expiry_date,
    warning: daysLeft > 0 && daysLeft <= 30,
  };
}

function getNextPromotionInfo(record) {
  const rules = PROMOTION_RULES[record.position_type];
  if (!rules || record.skill_level >= 100) return null;

  let requiredDays, nextLevel;
  if (record.skill_level === 0 || record.skill_level === 25) {
    requiredDays = rules['25_50'];
    nextLevel = 50;
  } else if (record.skill_level === 50) {
    requiredDays = rules['50_75'];
    nextLevel = 75;
  } else if (record.skill_level === 75) {
    requiredDays = rules['75_100'];
    nextLevel = 100;
  } else {
    return null;
  }

  return {
    currentLevel: record.skill_level,
    nextLevel,
    requiredDays,
    currentDays: record.consecutive_days || 0,
    daysRemaining: Math.max(0, requiredDays - (record.consecutive_days || 0)),
    eligible: (record.consecutive_days || 0) >= requiredDays,
    note: record.skill_level >= 50 ? '(离岗超过7天将重新计算连续在岗天数)' : '',
  };
}

function enrichRecord(r) {
  return { ...r, promotionInfo: getNextPromotionInfo(r), expiryInfo: checkExpiry(r) };
}

router.get('/', (_req, res) => {
  const records = db.prepare(`
    SELECT sl.*, e.name as employee_name
    FROM skill_levels sl LEFT JOIN employees e ON sl.employee_id = e.employee_id
    ORDER BY sl.updated_at DESC
  `).all();
  res.json(records.map(enrichRecord));
});

router.get('/:id', (req, res) => {
  const record = db.prepare(`
    SELECT sl.*, e.name as employee_name
    FROM skill_levels sl LEFT JOIN employees e ON sl.employee_id = e.employee_id
    WHERE sl.id = ?
  `).get(req.params.id);
  if (!record) return res.status(404).json({ error: '技能等级记录不存在' });
  res.json(enrichRecord(record));
});

router.get('/employee/:employeeId', (req, res) => {
  const records = db.prepare(`
    SELECT sl.*, e.name as employee_name
    FROM skill_levels sl LEFT JOIN employees e ON sl.employee_id = e.employee_id
    WHERE sl.employee_id = ? ORDER BY sl.updated_at DESC
  `).all(req.params.employeeId);
  res.json(records.map(enrichRecord));
});

router.post('/', upload.single('skill_attachment'), (req, res) => {
  const { employee_id, factory, line_name, position_name, skill_level, position_type, effective_date } = req.body;

  if (!employee_id || !position_name || !position_type) {
    return res.status(400).json({ error: '工号、岗位名称、岗位类型不能为空' });
  }

  const employee = db.prepare('SELECT * FROM employees WHERE employee_id = ?').get(employee_id);
  if (!employee) return res.status(404).json({ error: '该工号对应的员工不存在，请先录入员工信息' });

  const skill_attachment = req.file?.filename || null;
  const level = parseInt(skill_level) || 25;
  const effDate = effective_date || new Date().toISOString().split('T')[0];
  const expDate = calcExpiryDate(effDate, position_type);

  const result = db.prepare(`
    INSERT INTO skill_levels (employee_id, factory, line_name, position_name, skill_level, position_type, skill_attachment, effective_date, expiry_date, consecutive_from)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(employee_id, factory || null, line_name || null, position_name, level, position_type, skill_attachment, effDate, expDate, effDate);

  recalcAllForEmployee(employee_id);

  const created = db.prepare('SELECT * FROM skill_levels WHERE id = ?').get(result.lastInsertRowid);
  syncSkillLevel(result.lastInsertRowid);
  res.status(201).json(enrichRecord(created));
});

router.put('/:id', upload.single('skill_attachment'), (req, res) => {
  const existing = db.prepare('SELECT * FROM skill_levels WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '技能等级记录不存在' });

  const { factory, line_name, position_name, skill_level, position_type, effective_date } = req.body;
  const skill_attachment = req.file?.filename || existing.skill_attachment;

  const level = skill_level !== undefined ? parseInt(skill_level) : existing.skill_level;
  const posType = position_type || existing.position_type;
  const effDate = effective_date || existing.effective_date;
  const expDate = calcExpiryDate(effDate, posType);

  db.prepare(`
    UPDATE skill_levels SET
      factory = ?, line_name = ?, position_name = ?, skill_level = ?,
      position_type = ?, skill_attachment = ?, effective_date = ?, expiry_date = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    factory || existing.factory, line_name || existing.line_name,
    position_name || existing.position_name, level, posType,
    skill_attachment, effDate, expDate, req.params.id
  );

  recalcAllForEmployee(existing.employee_id);

  const updated = db.prepare('SELECT * FROM skill_levels WHERE id = ?').get(req.params.id);
  syncSkillLevel(req.params.id);
  res.json(enrichRecord(updated));
});

// Recalculate attendance-derived fields for a specific skill record
router.post('/:id/recalculate', (req, res) => {
  const record = db.prepare('SELECT * FROM skill_levels WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: '技能等级记录不存在' });

  recalcAllForEmployee(record.employee_id);

  const updated = db.prepare('SELECT * FROM skill_levels WHERE id = ?').get(req.params.id);
  syncSkillLevel(req.params.id);
  res.json({ ...enrichRecord(updated), message: '考勤数据已重新计算' });
});

router.post('/:id/promote', (req, res) => {
  const record = db.prepare('SELECT * FROM skill_levels WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: '技能等级记录不存在' });

  recalcAllForEmployee(record.employee_id);
  const fresh = db.prepare('SELECT * FROM skill_levels WHERE id = ?').get(req.params.id);
  const promoInfo = getNextPromotionInfo(fresh);

  if (!promoInfo) return res.status(400).json({ error: '已是最高等级 100%，无法继续晋升' });
  if (!promoInfo.eligible) {
    return res.status(400).json({
      error: `不满足晋升条件，还需连续在岗 ${promoInfo.daysRemaining} 天`,
    });
  }

  const today = new Date().toISOString().split('T')[0];

  db.prepare(`
    UPDATE skill_levels SET skill_level = ?, consecutive_days = 0, consecutive_from = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(promoInfo.nextLevel, today, req.params.id);

  const updated = db.prepare('SELECT * FROM skill_levels WHERE id = ?').get(req.params.id);
  syncSkillLevel(req.params.id);
  res.json({
    ...enrichRecord(updated),
    message: `技能等级已从 ${promoInfo.currentLevel}% 晋升至 ${promoInfo.nextLevel}%`,
  });
});

router.post('/:id/renew', (req, res) => {
  const record = db.prepare('SELECT * FROM skill_levels WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: '技能等级记录不存在' });

  const today = new Date().toISOString().split('T')[0];
  const newExpiry = calcExpiryDate(today, record.position_type);

  db.prepare(`
    UPDATE skill_levels SET effective_date = ?, expiry_date = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(today, newExpiry, req.params.id);

  syncSkillLevel(req.params.id);
  res.json({ ...enrichRecord(db.prepare('SELECT * FROM skill_levels WHERE id = ?').get(req.params.id)), message: '复核通过，有效期已更新' });
});

router.post('/sync-to-feishu', (req, res) => {
  syncAllToFeishu(res);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const record = db.prepare('SELECT * FROM skill_levels WHERE id = ?').get(id);
  if (!record) return res.status(404).json({ error: '岗位记录不存在' });

  if (record.feishu_record_id) {
    deleteFeishuRecord('skill_levels', record.feishu_record_id);
  }

  db.prepare('DELETE FROM attendance_records WHERE skill_level_id = ?').run(id);
  db.prepare('DELETE FROM skill_levels WHERE id = ?').run(id);
  res.json({ message: '岗位记录已删除' });
});

export default router;
