import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NotebookPen, Settings2 } from 'lucide-react';
import './style.css';
import { healthText, type Health } from './health';
import { StudyLogs } from './StudyLogs';

const pages = [
  {
    key: 'logs',
    label: '학습 기록',
    icon: NotebookPen,
    description: '오늘 공부한 시간과 내용을 기록하고 최근 기록을 확인합니다',
  },
  { key: 'settings', label: '설정', icon: Settings2, description: '앱 환경과 데이터 관리' },
];

export function App() {
  const [page, setPage] = useState('logs');
  const [health, setHealth] = useState<Health>({ state: 'loading' });
  useEffect(() => {
    fetch('/api/health')
      .then(async (response) => {
        const data = (await response.json()) as { today?: string; error?: string };
        setHealth(
          response.ok && data.today
            ? { state: 'ok', today: data.today }
            : { state: 'error', message: data.error ?? '서버 상태를 확인할 수 없습니다' },
        );
      })
      .catch(() => setHealth({ state: 'error', message: '서버에 연결할 수 없습니다' }));
  }, []);
  const current = pages.find((item) => item.key === page) ?? pages[0];
  return (
    <div className="shell">
      <aside>
        <a className="logo" href="#" onClick={() => setPage('logs')}>
          <span className="logo-mark">S</span>
          <span>공부 기록</span>
        </a>
        <nav aria-label="주요 메뉴">
          {pages.map((item) => (
            <button
              key={item.key}
              className={item.key === page ? 'active' : ''}
              aria-current={item.key === page ? 'page' : undefined}
              onClick={() => setPage(item.key)}
            >
              <item.icon size={18} aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="content">
        <div className="breadcrumb">
          내 워크스페이스 <span aria-hidden="true">›</span> <strong>{current.label}</strong>
        </div>
        <div className="page-heading">
          <div className="eyebrow">PERSONAL WORKSPACE</div>
          <h1>
            {current.label}
            <span className="heading-dot">.</span>
          </h1>
          <p>{current.description}</p>
        </div>
        {health.state === 'error' ? (
          <p role="alert" className="error">
            {healthText(health)}
          </p>
        ) : (
          <p role="status" className="status">
            {healthText(health)}
          </p>
        )}
        {current.key === 'logs' && health.state === 'ok' && <StudyLogs today={health.today} />}
        {current.key === 'settings' && (
          <section className="card empty">
            <h2>아직 설정 항목이 없습니다</h2>
            <p>설정은 관련 이슈 카드에서 추가합니다.</p>
          </section>
        )}
      </main>
    </div>
  );
}

const container = document.getElementById('root');
if (container) createRoot(container).render(<App />);
