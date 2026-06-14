import { useState, useEffect } from 'react';
import { api, SkillLevel, Employee, AttendanceRecord, AttendanceCalendar, Holiday, setAdminToken } from '../api';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

interface Props {
  adminToken: string | null;
}

export default function SkillLevelForm({ adminToken }: Props) {
  useEffect(() => { setAdminToken(adminToken); }, [adminToken]);
  const [records, setRecords] = useState<SkillLevel[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    employee_id: '',
    name: '',
    factory: '',
    line_name: '',
    position_name: '',
    skill_level: '25',
    position_type: '普通岗位',
    effective_date: new Date().toISOString().split('T')[0],
  });
  const [attachment, setAttachment] = useState<File | null>(null);

  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [calendars, setCalendars] = useState<Record<number, AttendanceCalendar>>({});
  const [calMonths, setCalMonths] = useState<Record<number, { year: number; month: number }>>({});

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '' });
  const [search, setSearch] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => { loadData(); loadHolidays(); }, []);

  async function loadData() {
    try {
      const [r, e] = await Promise.all([api.getSkillLevels(), api.getEmployees()]);
      setRecords(r);
      setEmployees(e);
    } catch (e: any) {
      showMsg('error', '加载数据失败: ' + (e.message || '网络错误'));
    }
  }

  async function loadHolidays() {
    try {
      setHolidays(await api.getHolidays());
    } catch { /* ignore */ }
  }

  function showMsg(type: string, text: string) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 6000);
  }

  async function ensureEmployee(): Promise<boolean> {
    if (!form.employee_id) return false;
    const exists = employees.find(emp => emp.employee_id === form.employee_id);
    if (exists) {
      if (form.name && exists.name !== form.name) {
        await api.updateEmployee(form.employee_id, { name: form.name }).catch(() => {});
        const updated = await api.getEmployees();
        setEmployees(updated);
      }
      return true;
    }
    try {
      await api.createEmployee({ employee_id: form.employee_id, name: form.name || form.employee_id });
      const updated = await api.getEmployees();
      setEmployees(updated);
      showMsg('success', `已自动创建员工 ${form.employee_id}`);
      return true;
    } catch (e: any) {
      if (e.message?.includes('已存在')) return true;
      showMsg('error', '创建员工失败: ' + e.message);
      return false;
    }
  }

  const getCalMonth = (id: number) => calMonths[id] || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };

  async function handleAddHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!holidayForm.date || !holidayForm.name) return;
    try {
      await api.addHoliday(holidayForm.date, holidayForm.name);
      showMsg('success', `已添加节假日: ${holidayForm.date}`);
      setHolidayForm({ date: '', name: '' });
      loadHolidays();
    } catch (e: any) {
      showMsg('error', e.message);
    }
  }

  async function handleRemoveHoliday(date: string) {
    try {
      await api.removeHoliday(date);
      showMsg('success', '已删除');
      loadHolidays();
    } catch (e: any) {
      showMsg('error', e.message);
    }
  }

  function exportCSV() {
    const q = search.trim().toLowerCase();
    const filtered = q ? records.filter(r =>
      r.employee_id.toLowerCase().includes(q) ||
      (r.employee_name || '').toLowerCase().includes(q) ||
      r.position_name.toLowerCase().includes(q) ||
      (r.factory || '').toLowerCase().includes(q) ||
      (r.line_name || '').toLowerCase().includes(q)
    ) : records;

    const header = '工号,姓名,工厂,线体,岗位名称,岗位类型,技能等级%,考核通过日期,有效期至,连续在岗天,离岗天数,最后在岗日期,状态';
    const rows = filtered.map(r => [
      r.employee_id, r.employee_name || '', r.factory || '', r.line_name || '',
      r.position_name, r.position_type, r.skill_level, r.effective_date, r.expiry_date,
      r.consecutive_days, r.away_days, r.last_work_date || '', r.status
    ].map(v => {
      const s = String(v);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));

    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `技能等级记录_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadCalendar(skillLevelId: number) {
    try {
      const { year, month } = getCalMonth(skillLevelId);
      const cal = await api.getAttendanceCalendar(skillLevelId, year, month);
      setCalendars(prev => ({ ...prev, [skillLevelId]: cal }));
    } catch { /* ignore */ }
  }

  function setCalMonth(skillLevelId: number, year: number, month: number) {
    setCalMonths(prev => ({ ...prev, [skillLevelId]: { year, month } }));
    setTimeout(() => loadCalendar(skillLevelId), 0);
  }

  function toggleCard(id: number) {
    if (expandedCard === id) {
      setExpandedCard(null);
    } else {
      setExpandedCard(id);
      loadCalendar(id);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (!form.employee_id || !form.position_name) {
        showMsg('error', '请填写工号和岗位名称');
        setLoading(false);
        return;
      }

      if (!(await ensureEmployee())) {
        setLoading(false);
        return;
      }

      const fd = new FormData();
      fd.append('employee_id', form.employee_id);
      fd.append('factory', form.factory);
      fd.append('line_name', form.line_name);
      fd.append('position_name', form.position_name);
      fd.append('skill_level', form.skill_level);
      fd.append('position_type', form.position_type);
      fd.append('effective_date', form.effective_date);
      if (attachment) fd.append('skill_attachment', attachment);

      if (editingId) {
        await api.updateSkillLevel(editingId, fd);
        showMsg('success', '技能等级记录更新成功');
      } else {
        await api.createSkillLevel(fd);
        showMsg('success', '技能等级记录创建成功');
      }

      resetForm();
      closeForm();
      loadData();
    } catch (e: any) {
      showMsg('error', '操作失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePunch(skillRec: SkillLevel) {
    try {
      const r = await api.punch({
        employee_id: skillRec.employee_id,
        skill_level_id: skillRec.id,
      });
      showMsg('success', r.message || '上岗打卡成功');
      loadData();
      if (expandedCard === skillRec.id) loadCalendar(skillRec.id);
    } catch (e: any) {
      showMsg('error', '打卡失败: ' + e.message);
    }
  }

  async function handleSetLeave(skillRec: SkillLevel) {
    try {
      await api.punch({
        employee_id: skillRec.employee_id,
        skill_level_id: skillRec.id,
        status: 'leave',
      });
      showMsg('warning', '已标记为离岗');
      loadData();
      if (expandedCard === skillRec.id) loadCalendar(skillRec.id);
    } catch (e: any) {
      showMsg('error', e.message);
    }
  }

  async function handlePromote(id: number) {
    try {
      const r = await api.promote(id);
      showMsg('success', r.message || '晋升成功');
      loadData();
    } catch (e: any) {
      showMsg('error', e.message);
    }
  }

  async function handleRecalculate(id: number) {
    try {
      const r = await api.recalculateSkillLevel(id);
      showMsg('success', r.message || '已刷新');
      loadData();
    } catch (e: any) {
      showMsg('error', e.message);
    }
  }

  async function handleRenew(id: number) {
    try {
      const r = await api.renewSkillLevel(id);
      showMsg('success', r.message || '续期成功');
      loadData();
    } catch (e: any) {
      showMsg('error', e.message);
    }
  }

  function openEdit(rec: SkillLevel) {
    setForm({
      employee_id: rec.employee_id,
      name: rec.employee_name || '',
      factory: rec.factory || '',
      line_name: rec.line_name || '',
      position_name: rec.position_name,
      skill_level: String(rec.skill_level),
      position_type: rec.position_type,
      effective_date: rec.effective_date || '',
    });
    setEditingId(rec.id);
    setShowForm(true);
  }

  function resetForm() {
    setForm({ employee_id: '', name: '', factory: '', line_name: '', position_name: '', skill_level: '25', position_type: '普通岗位', effective_date: new Date().toISOString().split('T')[0] });
    setAttachment(null);
    setEditingId(null);
  }

  function closeForm() { setShowForm(false); resetForm(); }
  function setField(field: string, value: string) { setForm(f => ({ ...f, [field]: value })); }

  function getStatusTag(rec: SkillLevel) {
    const { expired, warning } = rec.expiryInfo;
    if (rec.status === 'reset') return <span className="tag tag-reset">已归零</span>;
    if (expired) return <span className="tag tag-expired">已过期</span>;
    if (warning) return <span className="tag tag-warning">即将过期</span>;
    return <span className="tag tag-active">有效</span>;
  }

  function getLevelColor(level: number) {
    if (level >= 100) return 'var(--success)';
    if (level >= 75) return 'var(--primary)';
    if (level >= 50) return 'var(--warning)';
    return 'var(--gray-500)';
  }

  function renderCalendar(skillLevelId: number) {
    const cal = calendars[skillLevelId];
    if (!cal) return <div style={{ fontSize: 12, color: 'var(--gray-500)', padding: 8 }}>加载中...</div>;

    const { year, month } = getCalMonth(skillLevelId);
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => {
            const m = month === 1 ? 12 : month - 1;
            const y = month === 1 ? year - 1 : year;
            setCalMonth(skillLevelId, y, m);
          }}>&lt;</button>
          <strong style={{ fontSize: 13 }}>{year} 年 {month} 月</strong>
          <button className="btn btn-outline btn-sm" onClick={() => {
            const m = month === 12 ? 1 : month + 1;
            const y = month === 12 ? year + 1 : year;
            setCalMonth(skillLevelId, y, m);
          }}>&gt;</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
          {WEEKDAYS.map(w => <div key={w} style={{ fontSize: 10, color: 'var(--gray-500)', padding: 2 }}>{w}</div>)}
          {cal.days.map(d => {
            const rec = d.record;
            let bg = 'transparent', text = '';
            if (rec) {
              if (rec.status === 'normal') { bg = 'var(--success-light)'; text = '出勤'; }
              else if (rec.status === 'leave') { bg = 'var(--warning-light)'; text = '离岗'; }
              else if (rec.status === 'absent') { bg = 'var(--danger-light)'; text = '缺勤'; }
              else if (rec.status === 'late') { bg = '#fff3cd'; text = '迟到'; }
            }
            const isToday = d.date === new Date().toISOString().split('T')[0];
            return (
              <div key={d.date} title={d.date + (text ? ' ' + text : '')}
                style={{ padding: 2, fontSize: 10, minHeight: 26, background: bg, borderRadius: 3, border: isToday ? '2px solid var(--primary)' : '1px solid var(--gray-100)', cursor: rec ? 'pointer' : 'default', position: 'relative' }}
                onClick={() => {
                  if (!rec) return;
                  if (!confirm(`删除 ${d.date} 的${text}记录？`)) return;
                  api.deleteAttendance(rec.id).then(() => {
                    showMsg('success', '考勤记录已删除');
                    loadCalendar(skillLevelId);
                  }).catch((e: any) => showMsg('error', e.message));
                }}>
                <div style={{ fontWeight: isToday ? 700 : 400 }}>{d.day}</div>
                {text && <div style={{ fontSize: 8, color: 'var(--gray-500)' }}>{text}</div>}
                {rec && <div style={{ position: 'absolute', top: 0, right: 0, fontSize: 8, lineHeight: 1, padding: '0 2px', color: 'var(--gray-400)' }}>x</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {msg && <div className={`msg msg-${msg.type}`}>{msg.text}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="rule-box" style={{ borderTop: '3px solid var(--primary)' }}>
          <div className="rule-box-title">晋升规则</div>
          <div className="rule-step">
            <span className="step-badge step-25">25%</span>
            <span className="step-text">新员工首次上岗默认初始等级</span>
          </div>
          <div className="rule-step">
            <span className="step-badge step-50">50%</span>
            <span className="step-text">普通岗连续在岗 7 天 / 重点岗 10 天</span>
          </div>
          <div className="rule-step">
            <span className="step-badge step-75">75%</span>
            <span className="step-text">从 50% 起连续在岗 30 天</span>
          </div>
          <div className="rule-step">
            <span className="step-badge step-100">100%</span>
            <span className="step-text">从 75% 起连续在岗 60 天</span>
          </div>
        </div>

        <div className="rule-box" style={{ borderTop: '3px solid var(--warning)' }}>
          <div className="rule-box-title">清零规则</div>
          <div className="rule-item-modern">
            <span className="rule-dot-modern warn"></span>
            <span>离岗超 7 天，重新计算在岗时长</span>
          </div>
          <div className="rule-item-modern">
            <span className="rule-dot-modern danger"></span>
            <span>离岗满 3 个月，等级归零</span>
          </div>
          <div className="rule-box-title" style={{ marginTop: 16 }}>打卡说明</div>
          <div className="rule-item-modern">
            <span className="rule-dot-modern info"></span>
            <span>每个岗位独立打卡计算</span>
          </div>
          <div className="rule-item-modern">
            <span className="rule-dot-modern info"></span>
            <span>离岗天数自动排除节假日</span>
          </div>
        </div>

        <div className="rule-box" style={{ borderTop: '3px solid var(--success)' }}>
          <div className="rule-box-title">有效期</div>
          <div className="rule-item-modern">
            <span className="rule-dot-modern success"></span>
            <span>普通岗 1 年</span>
          </div>
          <div className="rule-item-modern">
            <span className="rule-dot-modern success"></span>
            <span>重点岗 6 个月</span>
          </div>
          <div className="rule-item-modern">
            <span className="rule-dot-modern success"></span>
            <span>到期前 30 天可复核续期</span>
          </div>
          <div className="rule-item-modern">
            <span className="rule-dot-modern success"></span>
            <span>到期未复核自动失效</span>
          </div>
        </div>
      </div>

      <div className="rule-card" style={{ marginTop: 12 }}>
        <h3>法定节假日配置 <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--gray-500)' }}>离岗天数自动排除</span></h3>
        <form onSubmit={handleAddHoliday} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="date" value={holidayForm.date}
            onChange={e => setHolidayForm(f => ({ ...f, date: e.target.value }))}
            style={{ flex: 1 }} />
          <input type="text" value={holidayForm.name} placeholder="节假日名称"
            onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))}
            style={{ flex: 2 }} />
          <button type="submit" className="btn btn-primary btn-sm">添加</button>
        </form>
        {holidays.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>暂无节假日配置，离岗天数按自然日计算</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {holidays.map(h => (
              <span key={h.date} className="tag tag-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'default' }}>
                {h.date} {h.name}
                <button type="button" onClick={() => handleRemoveHoliday(h.date)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, color: 'var(--danger)' }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          + 新增技能等级记录
        </button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeForm(); }}>
          <div className="modal">
            <h3>{editingId ? '编辑' : '新增'}技能等级记录</h3>
            <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 16 }}>
              连续在岗天数等字段由该岗位的打卡记录自动计算
            </p>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>工号<span className="required">*</span></label>
                  <input type="text" value={form.employee_id} placeholder="请输入员工工号"
                    onChange={e => {
                      setField('employee_id', e.target.value);
                      const found = employees.find(emp => emp.employee_id === e.target.value);
                      if (found) setField('name', found.name);
                    }} list="emp-list2" />
                </div>
                <div className="form-group">
                  <label>姓名</label>
                  <input type="text" value={form.name} placeholder="请输入员工姓名"
                    onChange={e => setField('name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>所属工厂</label>
                  <select value={form.factory} onChange={e => setField('factory', e.target.value)}>
                    <option value="">请选择</option>
                    <option value="平湖">平湖</option>
                    <option value="德清">德清</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>线体</label>
                  <input type="text" value={form.line_name} placeholder="请输入线体"
                    onChange={e => setField('line_name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>岗位名称<span className="required">*</span></label>
                  <input type="text" value={form.position_name} placeholder="请输入岗位名称"
                    onChange={e => setField('position_name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>技能等级</label>
                  <select value={form.skill_level} onChange={e => setField('skill_level', e.target.value)}>
                    <option value="0">0% (未评定)</option>
                    <option value="25">25%</option>
                    <option value="50">50%</option>
                    <option value="75">75%</option>
                    <option value="100">100%</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>岗位类型<span className="required">*</span></label>
                  <select value={form.position_type} onChange={e => setField('position_type', e.target.value)}>
                    <option value="普通岗位">普通岗位</option>
                    <option value="重点岗位">重点岗位</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>技能考核附件</label>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setAttachment(e.target.files?.[0] || null)} />
                </div>
                <div className="form-group">
                  <label>考核/复核通过日期</label>
                  <input type="date" value={form.effective_date}
                    onChange={e => setField('effective_date', e.target.value)} />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={closeForm}>取消</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? '保存中...' : (editingId ? '更新记录' : '创建记录')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <datalist id="emp-list2">
        {employees.map(e => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}
      </datalist>

      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            技能等级记录列表 <span className="badge">{records.length} 条</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="text" placeholder="搜索工号 / 姓名 / 岗位..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: 200, padding: '6px 10px', fontSize: 13, border: '1px solid var(--gray-200)', borderRadius: 6 }} />
            <button className="btn btn-outline btn-sm" onClick={exportCSV} title="导出CSV可导入飞书">导出 CSV</button>
          </div>
        </div>
        {(() => {
          const q = search.trim().toLowerCase();
          const filtered = q ? records.filter(r =>
            r.employee_id.toLowerCase().includes(q) ||
            (r.employee_name || '').toLowerCase().includes(q) ||
            r.position_name.toLowerCase().includes(q) ||
            (r.factory || '').toLowerCase().includes(q) ||
            (r.line_name || '').toLowerCase().includes(q)
          ) : records;
          if (filtered.length === 0) {
            return <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>{q ? `未找到匹配 "${search}" 的记录` : '暂无技能等级记录'}</p>;
          }
          return (
            <div className="inline-records">
              {filtered.map(rec => {
              const { promotionInfo, expiryInfo } = rec;
              const levelPercent = rec.skill_level;
              const isExpanded = expandedCard === rec.id;

              return (
                <div key={rec.id} className="record-card">
                  <div className="record-header">
                    <div>
                      <h4>{rec.employee_name || rec.employee_id}
                        <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--gray-500)', marginLeft: 8 }}>
                          {rec.employee_id}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--gray-500)', marginLeft: 8 }}>
                          | {rec.position_name}
                        </span>
                      </h4>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {getStatusTag(rec)}
                      <span className={`tag ${rec.position_type === '重点岗位' ? 'tag-warning' : 'tag-active'}`}>
                        {rec.position_type}
                      </span>
                    </div>
                  </div>

                  <div className="record-body">
                    <div className="record-field">
                      <span className="f-label">工厂:</span>
                      <span className="f-value">{rec.factory || '-'}</span>
                    </div>
                    <div className="record-field">
                      <span className="f-label">线体:</span>
                      <span className="f-value">{rec.line_name || '-'}</span>
                    </div>
                    <div className="record-field">
                      <span className="f-label">考核通过:</span>
                      <span className="f-value">{rec.effective_date}</span>
                    </div>
                    <div className="record-field">
                      <span className="f-label">有效期至:</span>
                      <span className="f-value" style={expiryInfo.expired ? { color: 'var(--danger)', fontWeight: 600 } : expiryInfo.warning ? { color: 'var(--warning)', fontWeight: 600 } : {}}>
                        {rec.expiry_date}
                        {expiryInfo.warning && !expiryInfo.expired &&
                          <span style={{ color: 'var(--warning)', marginLeft: 6, fontSize: 12 }}>(剩余{expiryInfo.daysLeft}天)</span>
                        }
                        {expiryInfo.expired &&
                          <span style={{ color: 'var(--danger)', marginLeft: 6, fontSize: 12 }}>(已过期)</span>
                        }
                      </span>
                    </div>
                    <div className="record-field">
                      <span className="f-label">连续在岗:</span>
                      <span className="f-value" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                        {rec.consecutive_days || 0} 天
                        <span style={{ fontSize: 10, color: 'var(--gray-500)', fontWeight: 400, marginLeft: 4 }}>(本岗位打卡)</span>
                      </span>
                    </div>
                    <div className="record-field">
                      <span className="f-label">离岗天数:</span>
                      <span className="f-value" style={{ color: rec.away_days > 7 ? 'var(--danger)' : 'var(--gray-900)' }}>
                        {rec.away_days || 0} 天
                        <span style={{ fontSize: 10, color: 'var(--gray-500)', fontWeight: 400, marginLeft: 4 }}>(自动)</span>
                      </span>
                    </div>
                    <div className="record-field">
                      <span className="f-label">最后在岗:</span>
                      <span className="f-value">{rec.last_work_date || '-'}
                        <span style={{ fontSize: 10, color: 'var(--gray-500)', fontWeight: 400, marginLeft: 4 }}>(自动)</span>
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, marginBottom: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>技能等级</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: getLevelColor(levelPercent) }}>
                        {levelPercent}%
                      </span>
                    </div>
                    <div className="level-bar">
                      <div className="level-bar-track">
                        <div className="level-bar-fill" style={{ width: `${levelPercent}%`, background: getLevelColor(levelPercent) }} />
                      </div>
                    </div>
                  </div>

                  {promotionInfo && (
                    <div style={{ fontSize: 13, color: 'var(--gray-700)', marginTop: 8, padding: '8px 12px', background: 'var(--gray-50)', borderRadius: 6 }}>
                      {promotionInfo.eligible
                        ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>满足晋升至 {promotionInfo.nextLevel}% 的条件</span>
                        : <span>晋升至 {promotionInfo.nextLevel}% 还需 <strong>{promotionInfo.daysRemaining}</strong> 天 ({promotionInfo.currentDays}/{promotionInfo.requiredDays})</span>
                      }
                      {promotionInfo.note && <span style={{ color: 'var(--warning)', marginLeft: 6 }}>{promotionInfo.note}</span>}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="btn btn-success btn-sm" onClick={() => handlePunch(rec)}>
                      上岗打卡
                    </button>
                    <button className="btn btn-warning btn-sm" onClick={() => handleSetLeave(rec)}>
                      标记离岗
                    </button>
                    {promotionInfo?.eligible && (
                      <button className="btn btn-primary btn-sm" onClick={() => handlePromote(rec.id)}>
                        晋升至 {promotionInfo.nextLevel}%
                      </button>
                    )}
                    {(expiryInfo.expired || expiryInfo.warning) && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleRenew(rec.id)}>
                        复核通过
                      </button>
                    )}
                    <button className="btn btn-outline btn-sm" onClick={() => handleRecalculate(rec.id)}>
                      刷新计算
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(rec)}>
                      编辑
                    </button>
                    <button className="btn btn-outline btn-sm" style={{ color: 'var(--red-500)', borderColor: 'var(--red-500)' }}
                      onClick={async () => {
                        if (!confirm(`确认删除 ${rec.employee_id} ${rec.position_name} 的岗位记录？\n相关考勤数据也将一并删除。`)) return;
                        try { await api.deleteSkillLevel(rec.id); showMsg('success', '岗位记录已删除'); loadData(); } catch (e: any) { showMsg('error', e.message); }
                      }}>
                      删除
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => toggleCard(rec.id)}>
                      {isExpanded ? '收起日历' : '考勤日历'}
                    </button>
                    {rec.skill_attachment && (
                      (() => {
                        const url = `/uploads/${rec.skill_attachment}`;
                        const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(rec.skill_attachment!);
                        return isImg
                          ? <button className="btn btn-outline btn-sm" style={{ textDecoration: 'none' }}
                              onClick={() => setPreviewUrl(url)}>查看附件</button>
                          : <a href={url} target="_blank" className="btn btn-outline btn-sm" style={{ textDecoration: 'none' }}>查看附件</a>;
                      })()
                    )}
                  </div>

                  {isExpanded && renderCalendar(rec.id)}
                </div>
              );
            })}
          </div>
          );
        })()}
      </div>
      {previewUrl && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, cursor: 'pointer'
        }} onClick={() => setPreviewUrl(null)}>
          <img src={previewUrl} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
