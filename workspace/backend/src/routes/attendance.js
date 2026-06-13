import { Router } from 'express';
import db from '../db.js';
import { recalcAllForEmployee } from '../attendance-calc.js';

const router = Router();

router.get('/', (req, res) => {
  const { employee_id, skill_level_id, from, to } = req.query;
  let sql = 'SELECT a.*, e.name as employee_name, sl.position_name FROM attendance_records a LEFT JOIN employees e ON a.employee_id = e.employee_id LEFT JOIN skill_levels sl ON a.skill_level_id = sl.id WHERE 1=1';
  const params = [];

  if (employee_id) { sql += ' AND a.employee_id = ?'; params.push(employee_id); }
  if (skill_level_id) { sql += ' AND a.skill_level_id = ?'; params.push(skill_level_id); }
  if (from) { sql += ' AND a.punch_date >= ?'; params.push(from); }
  if (to) { sql += ' AND a.punch_date <= ?'; params.push(to); }

  sql += ' ORDER BY a.punch_date DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/skill/:skillLevelId', (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM attendance_records WHERE skill_level_id = ?';
  const params = [req.params.skillLevelId];

  if (from) { sql += ' AND punch_date >= ?'; params.push(from); }
  if (to) { sql += ' AND punch_date <= ?'; params.push(to); }

  sql += ' ORDER BY punch_date DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:skillLevelId/calendar', (req, res) => {
  const { year, month } = req.query;
  const y = parseInt(year) || new Date().getFullYear();
  const m = parseInt(month) || (new Date().getMonth() + 1);

  const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).toISOString().split('T')[0];

  const records = db.prepare(`
    SELECT * FROM attendance_records WHERE skill_level_id = ? AND punch_date >= ? AND punch_date <= ?
    ORDER BY punch_date ASC
  `).all(req.params.skillLevelId, firstDay, lastDay);

  const recordMap = {};
  for (const r of records) recordMap[r.punch_date] = r;

  const daysInMonth = new Date(y, m, 0).getDate();
  const calendar = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendar.push({
      date: dateStr,
      day: d,
      weekday: new Date(y, m - 1, d).getDay(),
      record: recordMap[dateStr] || null,
    });
  }

  res.json({ year: y, month: m, days: calendar });
});

router.post('/punch', (req, res) => {
  const { employee_id, skill_level_id, punch_date, punch_in, status } = req.body;

  if (!employee_id || !skill_level_id) {
    return res.status(400).json({ error: '工号和岗位不能为空' });
  }

  const skillRec = db.prepare('SELECT * FROM skill_levels WHERE id = ? AND employee_id = ?').get(skill_level_id, employee_id);
  if (!skillRec) return res.status(404).json({ error: '该岗位记录不存在或不属于该员工' });

  const date = punch_date || new Date().toISOString().split('T')[0];
  const existing = db.prepare('SELECT * FROM attendance_records WHERE employee_id = ? AND skill_level_id = ? AND punch_date = ?').get(employee_id, skill_level_id, date);

  if (existing) {
    db.prepare(`
      UPDATE attendance_records SET
        punch_in = COALESCE(?, punch_in),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(punch_in || null, status || null, existing.id);

    recalcAllForEmployee(employee_id);
    const updated = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(existing.id);
    return res.json({ ...updated, message: '打卡记录已更新' });
  }

  const result = db.prepare(`
    INSERT INTO attendance_records (employee_id, skill_level_id, punch_date, punch_in, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(employee_id, skill_level_id, date, punch_in || null, status || 'normal');

  recalcAllForEmployee(employee_id);

  const created = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...created, message: '上岗打卡成功' });
});

router.post('/batch', (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: '请提供打卡记录数组' });
  }

  const affectedEmployees = new Set();
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO attendance_records (employee_id, skill_level_id, punch_date, punch_in, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const r of records) {
      if (!r.employee_id || !r.skill_level_id || !r.punch_date) continue;
      insertStmt.run(r.employee_id, r.skill_level_id, r.punch_date, r.punch_in || null, r.status || 'normal');
      affectedEmployees.add(r.employee_id);
    }
  });
  tx();

  for (const empId of affectedEmployees) {
    recalcAllForEmployee(empId);
  }

  res.json({ message: `已导入 ${records.length} 条打卡记录`, count: records.length });
});

router.delete('/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: '打卡记录不存在' });

  db.prepare('DELETE FROM attendance_records WHERE id = ?').run(req.params.id);
  recalcAllForEmployee(record.employee_id);
  res.json({ message: '打卡记录已删除' });
});

export default router;
