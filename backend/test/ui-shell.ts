// #110: the app now runs on React Router and the common AppShell (real React, covered by the
// frontend Vitest tests). The page tests here still mount the pages in the old minimal shell, kept
// as test scaffolding: menu buttons switch pages and the page body waits for /api/health. The pages
// themselves (StudyLogs, Textbooks, ...) are the real frontend files.
export const legacyShell = String.raw`import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, ChartColumn, NotebookPen, NotebookText, Settings2, Tags } from 'lucide-react';
import { healthText, type Health } from './health';
import { Keywords } from './keywords';
import { Retrospectives } from './retrospectives';
import { Stats } from './stats';
import { StudyLogs } from './study-logs';
import { Textbooks } from './textbooks';

const pages = [
  {
    key: 'logs',
    label: 'Study log',
    icon: NotebookPen,
    description: 'Record the time and topics you studied today and review recent logs',
  },
  {
    key: 'textbooks',
    label: 'Textbook',
    icon: BookOpen,
    description: 'Register textbooks and manage the title, author, and edition',
  },
  {
    key: 'keywords',
    label: 'Keyword',
    icon: Tags,
    description: 'Save important keywords you meet while studying by date and find them again',
  },
  {
    key: 'stats',
    label: 'Stats',
    icon: ChartColumn,
    description: 'See study time by period and the daily average at a glance',
  },
  {
    key: 'retrospectives',
    label: 'Retrospective',
    icon: NotebookText,
    description: 'Look back on a week or a month of study and write a retrospective',
  },
  { key: 'settings', label: 'Settings', icon: Settings2, description: 'App settings and data management' },
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
            : { state: 'error', message: data.error ?? 'Cannot check the server status' },
        );
      })
      .catch(() => setHealth({ state: 'error', message: 'Cannot reach the server' }));
  }, []);
  const current = pages.find((item) => item.key === page) ?? pages[0];
  return (
    <div className="shell">
      <aside>
        <a className="logo" href="#" onClick={() => setPage('logs')}>
          <span className="logo-mark">S</span>
          <span>Study Log</span>
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
        {current.key === 'textbooks' && health.state === 'ok' && <Textbooks />}
        {current.key === 'keywords' && health.state === 'ok' && <Keywords today={health.today} />}
        {current.key === 'stats' && health.state === 'ok' && <Stats />}
        {current.key === 'retrospectives' && health.state === 'ok' && (
          <Retrospectives today={health.today} />
        )}
        {current.key === 'settings' && (
          <section className="card empty">
            <h2>No settings yet</h2>
            <p>Settings are added in the related issue cards.</p>
          </section>
        )}
      </main>
    </div>
  );
}

const container = document.getElementById('root');
if (container) createRoot(container).render(<App />);
`;
