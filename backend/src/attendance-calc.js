import db from './db.js';

export function recalcAllForEmployee(employeeId) {
  const skillRecords = db.prepare(
    'SELECT * FROM skill_levels WHERE employee_id = ?'
  ).all(employeeId);

  const holidays = new Set(
    db.prepare('SELECT date FROM holidays').all().map(r => r.date)
  );

  for (const rec of skillRecords) {
    const consecutiveFrom = rec.consecutive_from || rec.effective_date || '1970-01-01';
    const awayFrom = rec.effective_date || '1970-01-01';
    const calc = calcAttendanceFields(rec.employee_id, rec.id, consecutiveFrom, awayFrom, holidays);
    db.prepare(`
      UPDATE skill_levels SET
        consecutive_days = ?, last_work_date = ?, away_days = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(calc.consecutiveDays, calc.lastWorkDate, calc.awayDays, rec.id);

    applyLeaveResets(rec.id);
  }
}

function calcAttendanceFields(employeeId, skillLevelId, consecutiveFrom, awayFrom, holidays) {
  const today = new Date().toISOString().split('T')[0];
  const cFromDate = consecutiveFrom || '1970-01-01';
  const aFromDate = awayFrom || '1970-01-01';

  const records = db.prepare(`
    SELECT punch_date, status FROM attendance_records
    WHERE employee_id = ? AND skill_level_id = ?
    ORDER BY punch_date DESC
  `).all(employeeId, skillLevelId);

  const validStatuses = new Set(['normal', 'late']);
  const recordMap = {};
  for (const r of records) recordMap[r.punch_date] = r;

  let awayDays = 0;
  let lastWorkDate = null;
  const cursor = new Date(today);

  for (let i = 0; i < 400; i++) {
    const cursorStr = cursor.toISOString().split('T')[0];
    if (cursorStr < aFromDate) break;
    const rec = recordMap[cursorStr];
    if (rec && validStatuses.has(rec.status)) {
      lastWorkDate = cursorStr;
      break;
    }
    if (!holidays.has(cursorStr)) {
      awayDays++;
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  let consecutiveDays = 0;
  if (lastWorkDate) {
    const c = new Date(lastWorkDate);
    for (let i = 0; i < 400; i++) {
      const cursorStr = c.toISOString().split('T')[0];
      const rec = recordMap[cursorStr];
      if (rec && validStatuses.has(rec.status)) {
        if (cursorStr >= cFromDate) {
          consecutiveDays++;
        } else {
          break;
        }
      } else {
        break;
      }
      c.setDate(c.getDate() - 1);
    }
  }

  return { consecutiveDays, lastWorkDate, awayDays };
}

function applyLeaveResets(skillLevelId) {
  const rec = db.prepare('SELECT * FROM skill_levels WHERE id = ?').get(skillLevelId);
  if (!rec) return;

  let newConsecutive = rec.consecutive_days;
  let newLevel = rec.skill_level;
  let newStatus = rec.status;
  let newConsecutiveFrom = rec.consecutive_from;

  if (rec.away_days >= 90) {
    newLevel = 0;
    newConsecutive = 0;
    newStatus = 'reset';
    newConsecutiveFrom = new Date().toISOString().split('T')[0];
  } else if (rec.away_days >= 7 && rec.skill_level > 0) {
    newConsecutive = 0;
    newConsecutiveFrom = new Date().toISOString().split('T')[0];
  }

  db.prepare(`
    UPDATE skill_levels SET skill_level = ?, consecutive_days = ?, consecutive_from = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newLevel, newConsecutive, newConsecutiveFrom, newStatus, skillLevelId);
}

export { calcAttendanceFields };
