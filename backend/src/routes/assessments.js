import { Router } from 'express';
import multer from 'multer';
import { extname } from 'path';
import db from '../db.js';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const UPLOAD_FIELDS = [
  { name: 'esd_attachment', maxCount: 1 },
  { name: 'esh_attachment', maxCount: 1 },
  { name: 'entry_attachment', maxCount: 1 },
];

router.get('/', (_req, res) => {
  const stmt = db.prepare(`
    SELECT a.*, e.name as employee_name
    FROM assessments a
    LEFT JOIN employees e ON a.employee_id = e.employee_id
    ORDER BY a.created_at DESC
  `);
  res.json(stmt.all());
});

router.get('/:employeeId', (req, res) => {
  const stmt = db.prepare(`
    SELECT a.*, e.name as employee_name
    FROM assessments a
    LEFT JOIN employees e ON a.employee_id = e.employee_id
    WHERE a.employee_id = ?
  `);
  const record = stmt.get(req.params.employeeId);
  if (!record) return res.status(404).json({ error: '考核记录不存在' });
  res.json(record);
});

router.put('/:id', upload.fields(UPLOAD_FIELDS), (req, res) => {
  const { id } = req.params;
  const record = db.prepare('SELECT * FROM assessments WHERE id = ?').get(id);
  if (!record) return res.status(404).json({ error: '考核记录不存在' });

  const { employee_id, name, esd_result, esh_result, esh_team_result, esh_dept_result, esh_company_result, entry_result } = req.body;

  if (employee_id && employee_id !== record.employee_id) {
    const emp = db.prepare('SELECT * FROM employees WHERE employee_id = ?').get(employee_id);
    if (!emp) {
      db.prepare('INSERT OR REPLACE INTO employees (employee_id, name) VALUES (?, ?)').run(employee_id, name || employee_id);
    } else if (name && name !== emp.name) {
      db.prepare('UPDATE employees SET name = ? WHERE employee_id = ?').run(name, employee_id);
    }
  }

  const esd_attachment = req.files?.esd_attachment?.[0]?.filename || null;
  const esh_attachment = req.files?.esh_attachment?.[0]?.filename || null;
  const entry_attachment = req.files?.entry_attachment?.[0]?.filename || null;

  db.prepare(`
    UPDATE assessments SET
      employee_id = COALESCE(?, employee_id),
      esd_result = ?,
      esd_attachment = COALESCE(?, esd_attachment),
      esh_result = ?,
      esh_team_result = ?,
      esh_dept_result = ?,
      esh_company_result = ?,
      esh_attachment = COALESCE(?, esh_attachment),
      entry_result = ?,
      entry_attachment = COALESCE(?, entry_attachment),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    employee_id || null,
    esd_result || null,
    esd_attachment || null,
    esh_result || null,
    esh_team_result || null,
    esh_dept_result || null,
    esh_company_result || null,
    esh_attachment || null,
    entry_result || null,
    entry_attachment || null,
    id
  );

  const updated = db.prepare('SELECT a.*, e.name as employee_name FROM assessments a LEFT JOIN employees e ON a.employee_id = e.employee_id WHERE a.id = ?').get(id);
  res.json(updated);
});

router.post('/', upload.fields(UPLOAD_FIELDS), (req, res) => {
  const { employee_id, esd_result, esh_result, esh_team_result, esh_dept_result, esh_company_result, entry_result } = req.body;

  if (!employee_id) return res.status(400).json({ error: '工号不能为空' });

  const employee = db.prepare('SELECT * FROM employees WHERE employee_id = ?').get(employee_id);
  if (!employee) return res.status(404).json({ error: '该工号对应的员工不存在，请先录入员工信息' });

  const existing = db.prepare('SELECT id FROM assessments WHERE employee_id = ?').get(employee_id);

  const esd_attachment = req.files?.esd_attachment?.[0]?.filename || null;
  const esh_attachment = req.files?.esh_attachment?.[0]?.filename || null;
  const entry_attachment = req.files?.entry_attachment?.[0]?.filename || null;

  if (existing) {
    const stmt = db.prepare(`
      UPDATE assessments SET
        esd_result = COALESCE(?, esd_result),
        esd_attachment = COALESCE(?, esd_attachment),
        esh_result = COALESCE(?, esh_result),
        esh_team_result = COALESCE(?, esh_team_result),
        esh_dept_result = COALESCE(?, esh_dept_result),
        esh_company_result = COALESCE(?, esh_company_result),
        esh_attachment = COALESCE(?, esh_attachment),
        entry_result = COALESCE(?, entry_result),
        entry_attachment = COALESCE(?, entry_attachment),
        updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = ?
    `);
    stmt.run(
      esd_result || null, esd_attachment || null,
      esh_result || null, esh_team_result || null, esh_dept_result || null, esh_company_result || null,
      esh_attachment || null, entry_result || null, entry_attachment || null,
      employee_id
    );
    const updated = db.prepare('SELECT * FROM assessments WHERE employee_id = ?').get(employee_id);
    return res.json(updated);
  }

  const stmt = db.prepare(`
    INSERT INTO assessments (employee_id, esd_result, esd_attachment, esh_result, esh_team_result, esh_dept_result, esh_company_result, esh_attachment, entry_result, entry_attachment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    employee_id, esd_result || null, esd_attachment,
    esh_result || null, esh_team_result || null, esh_dept_result || null, esh_company_result || null,
    esh_attachment, entry_result || null, entry_attachment
  );
  res.status(201).json(db.prepare('SELECT * FROM assessments WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const record = db.prepare('SELECT id FROM assessments WHERE id = ?').get(id);
  if (!record) return res.status(404).json({ error: '考核记录不存在' });
  db.prepare('DELETE FROM assessments WHERE id = ?').run(id);
  res.json({ message: '考核记录已删除' });
});

export default router;
