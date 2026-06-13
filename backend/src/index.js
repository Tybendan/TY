import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import employeesRouter from './routes/employees.js';
import assessmentsRouter from './routes/assessments.js';
import skillLevelsRouter from './routes/skill-levels.js';
import attendanceRouter from './routes/attendance.js';
import holidaysRouter from './routes/holidays.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Content-Disposition', 'inline');
  next();
}, express.static(join(__dirname, '..', 'uploads')));

app.use('/api/employees', employeesRouter);
app.use('/api/assessments', assessmentsRouter);
app.use('/api/skill-levels', skillLevelsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/holidays', holidaysRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[backend] Server running on http://localhost:${PORT}`);
});
