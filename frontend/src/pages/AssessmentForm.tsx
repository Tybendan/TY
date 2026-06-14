import { useState, useEffect } from 'react';
import { api, Assessment, Employee, setAdminToken } from '../api';

interface Props {
  adminToken: string | null;
}

export default function AssessmentForm({ adminToken }: Props) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [form, setForm] = useState({
    employee_id: '',
    name: '',
    esd_result: '',
    esh_result: '',
    esh_team_result: '',
    esh_dept_result: '',
    esh_company_result: '',
    entry_result: '',
    education: '',
    birth_date: '',
    id_card: '',
    ethnicity: '',
    hukou_address: '',
    current_address: '',
    phone: '',
    emergency_contact: '',
    marital_status: '',
    shoe_size: '',
    clothing_size: '',
    entry_date: '',
    team: '',
  });

  const [files, setFiles] = useState<{ esd?: File; esh?: File; entry?: File }>({});

  useEffect(() => { setAdminToken(adminToken); }, [adminToken]);
  useEffect(() => { loadData(); }, [adminToken]);

  async function loadData() {
    try {
      const [a, e] = await Promise.all([api.getAssessments(), api.getEmployees()]);
      setAssessments(a);
      setEmployees(e);
    } catch { /* ignore */ }
  }

  function showMsg(type: string, text: string) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function ensureEmployee(): Promise<boolean> {
    if (!form.employee_id || !form.name) {
      showMsg('error', '请填写工号和姓名');
      return false;
    }
    const exists = employees.find(e => e.employee_id === form.employee_id);
    const sensitiveData: Record<string, string> = {};
    const fields = ['education', 'birth_date', 'id_card', 'ethnicity', 'hukou_address', 'current_address', 'phone', 'emergency_contact', 'marital_status', 'shoe_size', 'clothing_size'];
    for (const f of fields) {
      if ((form as any)[f]) sensitiveData[f] = (form as any)[f];
    }
    const basicData: Record<string, string> = {};
    if (form.entry_date) basicData.entry_date = form.entry_date;
    if (form.team) basicData.team = form.team;
    if (!exists) {
      try {
        await api.createEmployee({ employee_id: form.employee_id, name: form.name, ...basicData, ...sensitiveData });
        const updated = await api.getEmployees();
        setEmployees(updated);
      } catch (e: any) {
        if (!e.message?.includes('已存在')) {
          showMsg('error', '创建员工失败: ' + e.message);
          return false;
        }
      }
    } else {
      const updates: Record<string, string> = {};
      if (exists.name !== form.name) updates.name = form.name;
      Object.assign(updates, basicData);
      Object.assign(updates, sensitiveData);
      if (Object.keys(updates).length > 0) {
        await api.updateEmployee(form.employee_id, updates).catch(() => {});
        const updated = await api.getEmployees();
        setEmployees(updated);
      }
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!(await ensureEmployee())) return;
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append('employee_id', form.employee_id);
      if (form.esd_result) fd.append('esd_result', form.esd_result);
      if (form.esh_result) fd.append('esh_result', form.esh_result);
      if (form.esh_team_result) fd.append('esh_team_result', form.esh_team_result);
      if (form.esh_dept_result) fd.append('esh_dept_result', form.esh_dept_result);
      if (form.esh_company_result) fd.append('esh_company_result', form.esh_company_result);
      if (form.entry_result) fd.append('entry_result', form.entry_result);
      if (files.esd) fd.append('esd_attachment', files.esd);
      if (files.esh) fd.append('esh_attachment', files.esh);
      if (files.entry) fd.append('entry_attachment', files.entry);

      if (editingId) {
        await api.updateAssessment(editingId, fd);
        showMsg('success', '考核记录更新成功');
      } else {
        await api.saveAssessment(fd);
        showMsg('success', '考核记录保存成功');
      }
      resetForm();
      loadData();
    } catch (e: any) {
      showMsg('error', (editingId ? '更新' : '保存') + '失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function isImageFile(name: string) {
    return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name);
  }

  function AttachmentLink({ label, file }: { label: string; file: string }) {
    const url = `/uploads/${file}`;
    return isImageFile(file)
      ? <button type="button" onClick={() => setPreviewUrl(url)} style={{ marginRight: 8, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 12 }}>{label}</button>
      : <a href={url} target="_blank" style={{ marginRight: 8 }}>{label}</a>;
  }

  function resetForm() {
    setForm({
      employee_id: '', name: '', esd_result: '', esh_result: '',
      esh_team_result: '', esh_dept_result: '', esh_company_result: '', entry_result: '',
      education: '', birth_date: '', id_card: '', ethnicity: '', hukou_address: '',
      current_address: '', phone: '', emergency_contact: '', marital_status: '', shoe_size: '', clothing_size: '',
      entry_date: '', team: '',
    });
    setFiles({});
    setEditingId(null);
  }

  function openEdit(a: Assessment) {
    setEditingId(a.id);
    const emp = employees.find(e => e.employee_id === a.employee_id);
    setForm({
      employee_id: a.employee_id,
      name: a.employee_name || '',
      esd_result: a.esd_result || '',
      esh_result: a.esh_result || '',
      esh_team_result: a.esh_team_result || '',
      esh_dept_result: a.esh_dept_result || '',
      esh_company_result: a.esh_company_result || '',
      entry_result: a.entry_result || '',
      education: emp?.education || '',
      birth_date: emp?.birth_date || '',
      id_card: emp?.id_card || '',
      ethnicity: emp?.ethnicity || '',
      hukou_address: emp?.hukou_address || '',
      current_address: emp?.current_address || '',
      phone: emp?.phone || '',
      emergency_contact: emp?.emergency_contact || '',
      marital_status: emp?.marital_status || '',
      shoe_size: emp?.shoe_size || '',
      clothing_size: emp?.clothing_size || '',
    });
    setFiles({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function exportCSV() {
    const q = search.trim().toLowerCase();
    const filtered = q ? assessments.filter(a =>
      a.employee_id.toLowerCase().includes(q) ||
      (a.employee_name || '').toLowerCase().includes(q)
    ) : assessments;

    const header = '工号,姓名,ESD考核,ESH考核,ESH班组级,ESH部门级,ESH公司级,入门级考核,提交时间';
    const rows = filtered.map(a => [
      a.employee_id, a.employee_name || '', a.esd_result || '', a.esh_result || '',
      a.esh_team_result || '', a.esh_dept_result || '', a.esh_company_result || '',
      a.entry_result || '', (a.created_at || '').split('T')[0]
    ].map(v => {
      const s = String(v);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));

    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `考核记录_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function setField(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  const passFailRadio = (field: string, label: string) => (
    <div className="form-group">
      <label>{label}</label>
      <div className="radio-group">
        <label className={`radio-label ${form[field as keyof typeof form] === '通过' ? 'pass' : ''}`}>
          <input type="radio" name={field} value="通过" checked={form[field as keyof typeof form] === '通过'}
            onChange={e => setField(field, e.target.value)} /> 通过
        </label>
        <label className={`radio-label ${form[field as keyof typeof form] === '不通过' ? 'fail' : ''}`}>
          <input type="radio" name={field} value="不通过" checked={form[field as keyof typeof form] === '不通过'}
            onChange={e => setField(field, e.target.value)} /> 不通过
        </label>
      </div>
    </div>
  );

  return (
    <div>
      {msg && <div className={`msg msg-${msg.type}`}>{msg.text}</div>}

      <form onSubmit={handleSubmit}>
        {editingId && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--warning-light)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>正在编辑考核记录</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={resetForm}>取消编辑</button>
          </div>
        )}
        <div className="section">
          <div className="section-title">
            {editingId ? '编辑考核记录' : '员工基本信息'} <span className="badge">必填</span>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>工号<span className="required">*</span></label>
              <input type="text" value={form.employee_id} placeholder="请输入员工工号"
                onChange={e => setField('employee_id', e.target.value)} list="emp-list" />
              <datalist id="emp-list">
                {employees.map(e => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}
              </datalist>
            </div>

            <div className="form-group">
              <label>姓名<span className="required">*</span></label>
              <input type="text" value={form.name} placeholder="请输入员工姓名"
                onChange={e => {
                  setField('name', e.target.value);
                  const found = employees.find(emp => emp.employee_id === form.employee_id);
                  if (found) setField('name', found.name);
                }} />
            </div>

            <div className="form-group">
              <label>入职时间</label>
              <input type="date" value={form.entry_date}
                onChange={e => setField('entry_date', e.target.value)} />
            </div>

            <div className="form-group">
              <label>班组</label>
              <input type="text" value={form.team} placeholder="如: A班/B班/甲班"
                onChange={e => setField('team', e.target.value)} />
            </div>
          </div>

          {adminToken && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600, marginBottom: 8 }}>以下信息仅管理员可见</div>
              <div className="form-grid">
                <div className="form-group">
                  <label>学历</label>
                  <input type="text" value={form.education} placeholder="如: 本科"
                    onChange={e => setField('education', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>出生年月日</label>
                  <input type="date" value={form.birth_date}
                    onChange={e => setField('birth_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>身份证号码</label>
                  <input type="text" value={form.id_card} placeholder="18位身份证号"
                    onChange={e => setField('id_card', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>民族</label>
                  <input type="text" value={form.ethnicity} placeholder="如: 汉族"
                    onChange={e => setField('ethnicity', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>户籍地址</label>
                  <input type="text" value={form.hukou_address} placeholder="省/市/区"
                    onChange={e => setField('hukou_address', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>现居住地址</label>
                  <input type="text" value={form.current_address} placeholder="现居住详细地址"
                    onChange={e => setField('current_address', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>联系电话</label>
                  <input type="tel" value={form.phone} placeholder="手机号码"
                    onChange={e => setField('phone', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>紧急联系人</label>
                  <input type="text" value={form.emergency_contact} placeholder="姓名 关系 电话"
                    onChange={e => setField('emergency_contact', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>婚姻状况</label>
                  <select value={form.marital_status}
                    onChange={e => setField('marital_status', e.target.value)}>
                    <option value="">--</option>
                    <option value="未婚">未婚</option>
                    <option value="已婚">已婚</option>
                    <option value="离异">离异</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>鞋码</label>
                  <input type="text" value={form.shoe_size} placeholder="如: 42"
                    onChange={e => setField('shoe_size', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>衣服尺码</label>
                  <input type="text" value={form.clothing_size} placeholder="如: XL"
                    onChange={e => setField('clothing_size', e.target.value)} />
                </div>
              </div>
            </div>
          )}

        </div>

        <div className="section">
          <div className="section-title">ESD 考核</div>
          <div className="form-grid">
            {passFailRadio('esd_result', 'ESD考核结果')}
            <div className="form-group">
              <label>ESD试题扫描件</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => setFiles(f => ({ ...f, esd: e.target.files?.[0] }))} />
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-title">ESH 考核（班组级 / 部门级 / 公司级）</div>
          <div className="form-grid">
            {passFailRadio('esh_result', 'ESH综合考核结果')}
          </div>

          <div className="esh-sub-row" style={{ marginTop: 12 }}>
            <div>
              <div className="sub-label">班组级考核</div>
              <div className="sub-radio-group">
                <label><input type="radio" name="esh_team" value="通过"
                  checked={form.esh_team_result === '通过'} onChange={e => setField('esh_team_result', e.target.value)} /> 通过</label>
                <label><input type="radio" name="esh_team" value="不通过"
                  checked={form.esh_team_result === '不通过'} onChange={e => setField('esh_team_result', e.target.value)} /> 不通过</label>
              </div>
            </div>
            <div>
              <div className="sub-label">部门级考核</div>
              <div className="sub-radio-group">
                <label><input type="radio" name="esh_dept" value="通过"
                  checked={form.esh_dept_result === '通过'} onChange={e => setField('esh_dept_result', e.target.value)} /> 通过</label>
                <label><input type="radio" name="esh_dept" value="不通过"
                  checked={form.esh_dept_result === '不通过'} onChange={e => setField('esh_dept_result', e.target.value)} /> 不通过</label>
              </div>
            </div>
            <div>
              <div className="sub-label">公司级考核</div>
              <div className="sub-radio-group">
                <label><input type="radio" name="esh_company" value="通过"
                  checked={form.esh_company_result === '通过'} onChange={e => setField('esh_company_result', e.target.value)} /> 通过</label>
                <label><input type="radio" name="esh_company" value="不通过"
                  checked={form.esh_company_result === '不通过'} onChange={e => setField('esh_company_result', e.target.value)} /> 不通过</label>
              </div>
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label>ESH试题扫描件</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => setFiles(f => ({ ...f, esh: e.target.files?.[0] }))} />
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-title">入门级考核</div>
          <div className="form-grid">
            {passFailRadio('entry_result', '入门级考核结果')}
            <div className="form-group">
              <label>入门级试题扫描件</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => setFiles(f => ({ ...f, entry: e.target.files?.[0] }))} />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={resetForm}>{editingId ? '取消编辑' : '重置表单'}</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '保存中...' : editingId ? '更新考核记录' : '提交考核记录'}
          </button>
        </div>
      </form>

      {/* Existing records */}
      <div className="section" style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            考核记录列表 <span className="badge">{assessments.length} 条</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="text" placeholder="搜索工号 / 姓名..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: 180, padding: '6px 10px', fontSize: 13, border: '1px solid var(--gray-200)', borderRadius: 6 }} />
            <button className="btn btn-outline btn-sm" onClick={exportCSV} title="导出CSV可导入飞书">导出 CSV</button>
          </div>
        </div>
        {(() => {
          const q = search.trim().toLowerCase();
          const filtered = q ? assessments.filter(a =>
            a.employee_id.toLowerCase().includes(q) ||
            (a.employee_name || '').toLowerCase().includes(q)
          ) : assessments;
          if (filtered.length === 0) {
            return <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>{q ? `未找到匹配 "${search}" 的记录` : '暂无考核记录'}</p>;
          }
          return (
            <table className="data-table">
              <thead>
                <tr>
                  <th>工号</th>
                  <th>姓名</th>
                  <th>ESD</th>
                  <th>ESH</th>
                  <th>ESH班组</th>
                  <th>ESH部门</th>
                  <th>ESH公司</th>
                  <th>入门级</th>
                  <th>提交时间</th>
                  <th>附件</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id}>
                    <td><strong>{a.employee_id}</strong></td>
                    <td>{a.employee_name || '-'}</td>
                    <td>{a.esd_result ? <span className={`tag ${a.esd_result === '通过' ? 'tag-pass' : 'tag-fail'}`}>{a.esd_result}</span> : '-'}</td>
                    <td>{a.esh_result ? <span className={`tag ${a.esh_result === '通过' ? 'tag-pass' : 'tag-fail'}`}>{a.esh_result}</span> : '-'}</td>
                    <td>{a.esh_team_result ? <span className={`tag ${a.esh_team_result === '通过' ? 'tag-pass' : 'tag-fail'}`}>{a.esh_team_result}</span> : '-'}</td>
                    <td>{a.esh_dept_result ? <span className={`tag ${a.esh_dept_result === '通过' ? 'tag-pass' : 'tag-fail'}`}>{a.esh_dept_result}</span> : '-'}</td>
                    <td>{a.esh_company_result ? <span className={`tag ${a.esh_company_result === '通过' ? 'tag-pass' : 'tag-fail'}`}>{a.esh_company_result}</span> : '-'}</td>
                    <td>{a.entry_result ? <span className={`tag ${a.entry_result === '通过' ? 'tag-pass' : 'tag-fail'}`}>{a.entry_result}</span> : '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>{a.created_at?.split('T')[0]}</td>
                    <td style={{ fontSize: 12 }}>
                      {a.esd_attachment && <AttachmentLink label="ESD" file={a.esd_attachment} />}
                      {a.esh_attachment && <AttachmentLink label="ESH" file={a.esh_attachment} />}
                      {a.entry_attachment && <AttachmentLink label="入门" file={a.entry_attachment} />}
                      {!a.esd_attachment && !a.esh_attachment && !a.entry_attachment && '-'}
                    </td>
                    <td>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => openEdit(a)}>编辑</button>
                      <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: 8, color: 'var(--red-500)', borderColor: 'var(--red-500)' }}
                        onClick={async () => {
                          if (!confirm(`确认删除 ${a.employee_id} ${a.employee_name} 的考核记录？`)) return;
                          try { await api.deleteAssessment(a.id); showMsg('success', '考核记录已删除'); loadData(); } catch (e: any) { showMsg('error', e.message); }
                        }}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
