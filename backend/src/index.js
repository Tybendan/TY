import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import employeesRouter from './routes/employees.js';
import assessmentsRouter from './routes/assessments.js';
import skillLevelsRouter from './routes/skill-level.js';
import attendanceRouter from './routes/attendance.js';
import holidaysRouter from './routes/holidays.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

console.log('[backend] Starting server...');
console.logbackend] __dirname:',);
console.log('[backend] PORT:',);

app.use(cors());
app.use(express.json());

// Serve frontend static files (production)
const frontendDist = join(__dirname, '..', 'public');
console.log('[backend] Serving frontend from:', frontDist);
console.log('[backend] Public dir exists:', existsSync(frontendDist));
if (existsSync(frontendDist)) {
  console.log('[backend] Public dir contents:', readdirSync(frontendDist));
}

app.use(express.static(frontendDist));

// Serve uploads
constsDir = join(__dirname, '..',uploads');
console.log('[backend] Uploads dir:', uploadsDir, 'exists:', existsSync(uploadsDir));
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Content-Disposition', 'inline');
  next();
}, express.static(uploadsDir));

// API routes
app.use('/api/employees', employeesRouter);
app.use('/api/assessments', assessmentsRouter);
app.use('/api/skill-levels', skillLevelsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/holidays', holidaysRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback - must be last
app.get('*', (_req, res) => {
  const indexPath = join(frontendDist, 'index.html');
  console.log('[backend] Serving index.html from:', indexPath, 'exists:', existsSync(indexPath));
  try {
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, 'utf-8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      res.status(500).send(`index.html not found at ${indexPath}`);
    }
  } catch (err) {
    res.status(500).send(`Error loading index.html: ${err.message}`);
  }
});

app.listen(PORT, '0..0', () => {
  console.log(`[backend] ✅ Server running on http://0.0.0:${PORT}`);
  console.log(`[backend] ✅ Health check: http://0.0..0:${PORT}/api/health`);
});
