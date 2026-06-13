import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/', (_req, res) => {
  const stmt = db.prepare('SELECT date, name FROM holidays ORDER BY date ASC');
  res.json(stmt.all());
});

router.post('/', (req, res) => {
  const { date, name } = req.body;
  if (!date || !name) return res.status(400).json({ error: '日期和名称不能为空' });

  try {
    db.prepare('INSERT INTO holidays (date, name) VALUES (?, ?)').run(date, name);
    res.status(201).json({ date, name, message: '节假日已添加' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '该日期已存在' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:date', (req, res) => {
  const result = db.prepare('DELETE FROM holidays WHERE date = ?').run(req.params.date);
  if (result.changes === 0) return res.status(404).json({ error: '节假日不存在' });
  res.json({ message: '节假日已删除' });
});

export default router;
