import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  NotebookPen,
  NotebookText,
  Settings2,
  Tags,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { AppShell, type NavItem } from './components/layout/app-shell';
import { EmptyState } from './components/ui/empty-state';
import { Toaster } from './components/ui/sonner';
import { type Health, healthText } from './health';
import { Keywords } from './keywords';
import { Retrospectives } from './retrospectives';
import { ReviewBadge } from './review-badge';
import { Reviews } from './reviews';
import { Schedules } from './schedules';
import { Stats } from './stats';
import { StudyLogs } from './study-logs';
import { Textbooks } from './textbooks';

// Every page URL lives here (central docs/directory-rules.md). The study log is the first page.
const pages = {
  logs: '/',
  schedules: '/schedules',
  reviews: '/reviews',
  textbooks: '/textbooks',
  keywords: '/keywords',
  stats: '/stats',
  retrospectives: '/retrospectives',
  settings: '/settings',
} as const;

// Main menu (LNB) items, in display order.
const nav: NavItem[] = [
  { to: pages.logs, label: 'Study log', icon: NotebookPen },
  { to: pages.schedules, label: 'Schedules', icon: CalendarDays },
  { to: pages.reviews, label: 'Reviews', icon: CalendarCheck },
  { to: pages.textbooks, label: 'Textbooks', icon: BookOpen },
  { to: pages.keywords, label: 'Keywords', icon: Tags },
  { to: pages.stats, label: 'Stats', icon: ChartColumn },
  { to: pages.retrospectives, label: 'Retrospectives', icon: NotebookText },
  { to: pages.settings, label: 'Settings', icon: Settings2 },
];

function useHealth() {
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
  return health;
}

// Page heading and server status. The page body needs the server date, so it waits for /api/health.
// The body keeps the app's own styles (style.css, scoped to .legacy).
function Page({
  title,
  description,
  health,
  children,
}: {
  title: string;
  description: string;
  health: Health;
  children: (today: string) => ReactNode;
}) {
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 id="page-title">{title}</h1>
        <p className="text-body text-muted-foreground">{description}</p>
        {health.state === 'error' ? (
          <p role="alert" className="text-body-sm text-destructive">
            {healthText(health)}
          </p>
        ) : (
          <p role="status" className="text-caption text-muted-foreground">
            {healthText(health)}
          </p>
        )}
      </header>
      {health.state === 'ok' && <div className="legacy">{children(health.today)}</div>}
    </section>
  );
}

export function App() {
  const health = useHealth();
  // Pages that can change what is due bump this, so the badge counts again without a page change.
  const [reviewVersion, setReviewVersion] = useState(0);
  const reviewsChanged = () => setReviewVersion((version) => version + 1);
  return (
    <BrowserRouter>
      <AppShell
        appName="Study Log"
        nav={nav}
        actions={<ReviewBadge to={pages.reviews} version={reviewVersion} />}
      >
        <Routes>
          <Route
            path={pages.logs}
            element={
              <Page
                title="Study log"
                description="Record the time and topics you studied today and review recent logs"
                health={health}
              >
                {(today) => <StudyLogs today={today} onChange={reviewsChanged} />}
              </Page>
            }
          />
          <Route
            path={pages.schedules}
            element={
              <Page
                title="Schedules"
                description="Set a period and a daily amount to make a study goal for each day"
                health={health}
              >
                {(today) => <Schedules today={today} />}
              </Page>
            }
          />
          <Route
            path={pages.reviews}
            element={
              <Page
                title="Reviews"
                description="Check what to review by period, then mark it done or change its date"
                health={health}
              >
                {() => <Reviews onChange={reviewsChanged} />}
              </Page>
            }
          />
          <Route
            path={pages.textbooks}
            element={
              <Page
                title="Textbooks"
                description="Register textbooks and manage the title, author, and edition"
                health={health}
              >
                {() => <Textbooks />}
              </Page>
            }
          />
          <Route
            path={pages.keywords}
            element={
              <Page
                title="Keywords"
                description="Save important keywords you meet while studying by date and find them again"
                health={health}
              >
                {(today) => <Keywords today={today} />}
              </Page>
            }
          />
          <Route
            path={pages.stats}
            element={
              <Page
                title="Stats"
                description="See study time by period and the daily average at a glance"
                health={health}
              >
                {() => <Stats />}
              </Page>
            }
          />
          <Route
            path={pages.retrospectives}
            element={
              <Page
                title="Retrospectives"
                description="Look back on a week or a month of study and write a retrospective"
                health={health}
              >
                {(today) => <Retrospectives today={today} />}
              </Page>
            }
          />
          <Route
            path={pages.settings}
            element={
              <Page title="Settings" description="App settings and data management" health={health}>
                {() => (
                  <EmptyState
                    title="No settings yet"
                    description="Settings are added in the related issue cards."
                  />
                )}
              </Page>
            }
          />
          <Route path="*" element={<Navigate to={pages.logs} replace />} />
        </Routes>
      </AppShell>
      <Toaster />
    </BrowserRouter>
  );
}
