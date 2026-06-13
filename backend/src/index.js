import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import employeesRouter from './routes/employees.js';
import assessmentsRouter from './routes/assessments.js';
import skillLevelsRouter from './routes/skill-levels.js';
import attendanceRouter from './routes/attendance.js';
import holidaysRouter from './routes/holidays.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

console.log('[backend] __dirname:', __dirname);
console.log('[backend] PORT:', PORT);

app.use(cors());
app.use(express.json());

const frontendDist = join(__dirname, '..', 'public');
console.log('[backend] Public dir:', frontendDist, 'exists existsSync(front));
if (existsSync(frontendDist)) {
  console.log('[backend] Public contents:', JSON.stringify(readdirSync(frontendDist)));
}

app.use(express.static(frontendDist));

app.use('/api/employees', employeesRouter);
app.use('/api/assessments', assessmentsRouter);
app.use('/api/skill-levels', skillLevelsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/holidays', holidaysRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('*', (_req, res) => {
  const file = join(frontendDist, 'index.html');
  console.log('[backend] Request:', _req.path, 'file:', file, 'exists:', existsSync(file));
  if (exists)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(readFileSync(file, 'utf-8'));
  } else {
    res.status(500).json({ error: 'index.html not found', dir: frontendDist, contents: existsSync(frontendDist) ? readdirSyncrontendDist) : 'NOT FOUND' });
  }
});

app.listen(PORT, '0.0.0.', () => {
  console.log('[backend] Listening on 0.0.0:' + PORT);
});
