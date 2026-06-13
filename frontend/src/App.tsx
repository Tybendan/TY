import { useState } from 'react';
import AssessmentForm from './pages/AssessmentForm';
import SkillLevelForm from './pages/SkillLevelForm';
import { api } from './api';

export default function App() {
  const [tab, setTab] = useState<'assessment' | 'skill'>('assessment');
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminPwd, setAdminPwd] = useState('');

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.verifyAdmin(adminPwd);
      setAdminToken(adminPwd);
      setAdminPwd('');
    } catch (ex: any) {
      alert(ex.message || '管理员验证失败');
    }
  }

  function handleAdminLogout() {
    setAdminToken(null);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>员工培训管理系统</h1>
        <p className="subtitle">新员工准入考核 / 岗位技能等级管理</p>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          {adminToken ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>管理员模式已开启</span>
              <button className="btn btn-outline btn-sm" onClick={handleAdminLogout}>退出管理</button>
            </>
          ) : (
            <form onSubmit={handleAdminLogin} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="password" value={adminPwd} placeholder="管理员密码"
                onChange={e => setAdminPwd(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', width: 140 }} />
              <button type="submit" className="btn btn-outline btn-sm">管理员登录</button>
            </form>
          )}
        </div>
      </header>

      <nav className="tab-nav">
        <button
          className={`tab-btn ${tab === 'assessment' ? 'active' : ''}`}
          onClick={() => setTab('assessment')}
        >
          表单一：新员工基础信息与准入考核表
        </button>
        <button
          className={`tab-btn ${tab === 'skill' ? 'active' : ''}`}
          onClick={() => setTab('skill')}
        >
          表单二：员工岗位技能等级管理表
        </button>
      </nav>

      <main className="main-content">
        {tab === 'assessment' ? <AssessmentForm adminToken={adminToken} /> : <SkillLevelForm adminToken={adminToken} />}
      </main>
    </div>
  );
}
