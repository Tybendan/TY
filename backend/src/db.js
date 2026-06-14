import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'data.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'resigned')),
    feishu_record_id TEXT,
    education TEXT,
    birth_date TEXT,
    id_card TEXT,
    ethnicity TEXT,
    hukou_address TEXT,
    current_address TEXT,
    phone TEXT,
    emergency_contact TEXT,
    marital_status TEXT,
    shoe_size TEXT,
    clothing_size TEXT,
    entry_date TEXT,
    team TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    esd_result TEXT CHECK(esd_result IN ('通过', '不通过', NULL)),
    esd_attachment TEXT,
    esh_result TEXT CHECK(esh_result IN ('通过', '不通过', NULL)),
    esh_team_result TEXT CHECK(esh_team_result IN ('通过', '不通过', NULL)),
    esh_dept_result TEXT CHECK(esh_dept_result IN ('通过', '不通过', NULL)),
    esh_company_result TEXT CHECK(esh_company_result IN ('通过', '不通过', NULL)),
    esh_attachment TEXT,
    entry_result TEXT CHECK(entry_result IN ('通过', '不通过', NULL)),
    entry_attachment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
  );

  CREATE TABLE IF NOT EXISTS skill_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    factory TEXT CHECK(factory IN ('平湖', '德清', NULL)),
    line_name TEXT,
    position_name TEXT NOT NULL,
    skill_level INTEGER DEFAULT 25 CHECK(skill_level IN (0, 25, 50, 75, 100)),
    position_type TEXT NOT NULL CHECK(position_type IN ('重点岗位', '普通岗位')),
    skill_attachment TEXT,
    consecutive_days INTEGER DEFAULT 0,
    consecutive_from TEXT,
    last_work_date TEXT,
    away_days INTEGER DEFAULT 0,
    effective_date TEXT,
    expiry_date TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'reset')),
    feishu_record_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
  );

  CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    skill_level_id INTEGER NOT NULL,
    punch_date TEXT NOT NULL,
    punch_in TEXT,
    status TEXT DEFAULT 'normal' CHECK(status IN ('normal', 'late', 'absent', 'leave')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, skill_level_id, punch_date),
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    FOREIGN KEY (skill_level_id) REFERENCES skill_levels(id)
  );

  CREATE TABLE IF NOT EXISTS holidays (
    date TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function safeAlter(table, column, type) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
}

// Migrations: add columns that may not exist in older databases
safeAlter('employees', 'status', "TEXT DEFAULT 'active'");
safeAlter('employees', 'feishu_record_id', 'TEXT');
safeAlter('skill_levels', 'feishu_record_id', 'TEXT');
safeAlter('employees', 'education', 'TEXT');
safeAlter('employees', 'birth_date', 'TEXT');
safeAlter('employees', 'id_card', 'TEXT');
safeAlter('employees', 'ethnicity', 'TEXT');
safeAlter('employees', 'hukou_address', 'TEXT');
safeAlter('employees', 'current_address', 'TEXT');
safeAlter('employees', 'phone', 'TEXT');
safeAlter('employees', 'emergency_contact', 'TEXT');
safeAlter('employees', 'marital_status', 'TEXT');
safeAlter('employees', 'shoe_size', 'TEXT');
safeAlter('employees', 'clothing_size', 'TEXT');
safeAlter('employees', 'entry_date', 'TEXT');
safeAlter('employees', 'team', 'TEXT');

export default db;
