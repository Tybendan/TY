const BASE = '/api';

let adminToken: string | null = null;

export function setAdminToken(token: string | null) {
  adminToken = token;
}

async function request(url: string, options?: RequestInit) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminToken) headers['X-Admin-Token'] = adminToken;
  const res = await fetch(BASE + url, {
    headers,
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

export interface Employee {
  id: number;
  employee_id: string;
  name: string;
  status: string;
  feishu_record_id?: string;
  education?: string;
  birth_date?: string;
  id_card?: string;
  ethnicity?: string;
  hukou_address?: string;
  current_address?: string;
  phone?: string;
  emergency_contact?: string;
  marital_status?: string;
  shoe_size?: string;
  clothing_size?: string;
  created_at: string;
}

export interface Assessment {
  id: number;
  employee_id: string;
  employee_name?: string;
  esd_result: string | null;
  esd_attachment: string | null;
  esh_result: string | null;
  esh_team_result: string | null;
  esh_dept_result: string | null;
  esh_company_result: string | null;
  esh_attachment: string | null;
  entry_result: string | null;
  entry_attachment: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromotionInfo {
  currentLevel: number;
  nextLevel: number;
  requiredDays: number;
  currentDays: number;
  daysRemaining: number;
  eligible: boolean;
  note: string;
}

export interface ExpiryInfo {
  expired: boolean;
  daysLeft: number;
  expiryDate: string;
  warning: boolean;
}

export interface SkillLevel {
  id: number;
  employee_id: string;
  employee_name?: string;
  factory: string | null;
  line_name: string | null;
  position_name: string;
  skill_level: number;
  position_type: string;
  skill_attachment: string | null;
  consecutive_days: number;
  consecutive_from: string | null;
  last_work_date: string | null;
  away_days: number;
  effective_date: string;
  expiry_date: string;
  status: string;
  created_at: string;
  updated_at: string;
  promotionInfo: PromotionInfo | null;
  expiryInfo: ExpiryInfo;
}

export interface AttendanceRecord {
  id: number;
  employee_id: string;
  skill_level_id: number;
  employee_name?: string;
  position_name?: string;
  punch_date: string;
  punch_in: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AttendanceCalendar {
  year: number;
  month: number;
  days: {
    date: string;
    day: number;
    weekday: number;
    record: AttendanceRecord | null;
  }[];
}

export interface Holiday {
  date: string;
  name: string;
}

export const api = {
  verifyAdmin: (password: string) =>
    request('/employees/verify-admin', { method: 'POST', body: JSON.stringify({ password }) }) as Promise<{ valid: boolean }>,

  getEmployees: () => request('/employees') as Promise<Employee[]>,
  getEmployee: (id: string) => request(`/employees/${id}`) as Promise<Employee>,
  createEmployee: (data: { employee_id: string; name: string; [key: string]: any }) =>
    request('/employees', { method: 'POST', body: JSON.stringify(data) }) as Promise<Employee>,
  updateEmployee: (employeeId: string, data: { name?: string; status?: string; [key: string]: any }) =>
    request(`/employees/${employeeId}`, { method: 'PUT', body: JSON.stringify(data) }) as Promise<Employee>,
  setEmployeeStatus: (employeeId: string, status: string) =>
    request(`/employees/${employeeId}`, { method: 'PUT', body: JSON.stringify({ status }) }) as Promise<Employee>,

  getAssessments: () => request('/assessments') as Promise<Assessment[]>,
  getAssessment: (employeeId: string) => request(`/assessments/${employeeId}`) as Promise<Assessment>,
  saveAssessment: (formData: FormData) =>
    fetch(BASE + '/assessments', { method: 'POST', body: formData }).then(r => r.json()) as Promise<Assessment>,
  updateAssessment: (id: number, formData: FormData) =>
    fetch(BASE + `/assessments/${id}`, { method: 'PUT', body: formData }).then(r => r.json()) as Promise<Assessment>,
  deleteAssessment: (id: number) =>
    request(`/assessments/${id}`, { method: 'DELETE' }) as Promise<{ message: string }>,

  getSkillLevels: () => request('/skill-levels') as Promise<SkillLevel[]>,
  getSkillLevel: (id: number) => request(`/skill-levels/${id}`) as Promise<SkillLevel>,
  getSkillLevelsByEmployee: (employeeId: string) =>
    request(`/skill-levels/employee/${employeeId}`) as Promise<SkillLevel[]>,
  createSkillLevel: (formData: FormData) =>
    fetch(BASE + '/skill-levels', { method: 'POST', body: formData }).then(r => r.json()) as Promise<SkillLevel>,
  updateSkillLevel: (id: number, formData: FormData) =>
    fetch(BASE + `/skill-levels/${id}`, { method: 'PUT', body: formData }).then(r => r.json()) as Promise<SkillLevel>,
  recalculateSkillLevel: (id: number) =>
    request(`/skill-levels/${id}/recalculate`, { method: 'POST' }) as Promise<SkillLevel & { message: string }>,
  promote: (id: number) =>
    request(`/skill-levels/${id}/promote`, { method: 'POST' }) as Promise<SkillLevel & { message: string }>,
  renewSkillLevel: (id: number) =>
    request(`/skill-levels/${id}/renew`, { method: 'POST' }) as Promise<SkillLevel & { message: string }>,
  deleteSkillLevel: (id: number) =>
    request(`/skill-levels/${id}`, { method: 'DELETE' }) as Promise<{ message: string }>,

  getAttendanceBySkill: (skillLevelId: number, from?: string, to?: string) => {
    let url = `/attendance/skill/${skillLevelId}`;
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const qs = params.toString();
    return request(url + (qs ? '?' + qs : '')) as Promise<AttendanceRecord[]>;
  },
  getAttendanceCalendar: (skillLevelId: number, year: number, month: number) =>
    request(`/attendance/${skillLevelId}/calendar?year=${year}&month=${month}`) as Promise<AttendanceCalendar>,
  punch: (data: { employee_id: string; skill_level_id: number; punch_date?: string; status?: string }) =>
    request('/attendance/punch', { method: 'POST', body: JSON.stringify(data) }) as Promise<AttendanceRecord & { message: string }>,
  batchPunch: (records: { employee_id: string; skill_level_id: number; punch_date: string; status?: string }[]) =>
    request('/attendance/batch', { method: 'POST', body: JSON.stringify({ records }) }) as Promise<{ message: string; count: number }>,
  deleteAttendance: (id: number) =>
    request(`/attendance/${id}`, { method: 'DELETE' }) as Promise<{ message: string }>,

  getHolidays: () => request('/holidays') as Promise<Holiday[]>,
  addHoliday: (date: string, name: string) =>
    request('/holidays', { method: 'POST', body: JSON.stringify({ date, name }) }) as Promise<Holiday & { message: string }>,
  removeHoliday: (date: string) =>
    request(`/holidays/${date}`, { method: 'DELETE' }) as Promise<{ message: string }>,
};
