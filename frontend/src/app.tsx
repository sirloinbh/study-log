// Installs the English required-field messages once for every form (#462).
import './validation-messages';

import { QueryClientProvider } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  CircleX,
  Code,
  Grid3x3,
  NotebookPen,
  NotebookText,
  Rows3,
  Settings2,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { CalendarSync } from './calendar-sync';
import { CodingProblems } from './coding-problems';
import { AppShell, type NavItem } from './components/layout/app-shell';
import { Toaster } from './components/ui/sonner';
import { DataExport } from './data-export';
import { useServiceDate } from './date';
import { type Health, healthText, useHealth } from './health';
import { createQueryClient } from './lib/query';
import { Retrospectives } from './retrospectives';
import { ReviewBadge } from './review-badge';
import { Reviews } from './reviews';
import { Schedules } from './schedules';
import { AccountActions, SignInGate } from './sign-in';
import { Stats } from './stats';
import { StudyLogs } from './study-logs';
import { Textbooks } from './textbooks';
import { TwelveWeekView } from './twelve-week-view';
import { WeekView } from './week-view';
import { WrongExercises } from './wrong-exercises';

// Every page URL lives here (central docs/directory-rules.md). The study log is the start page.
const pages = {
  logs: '/',
  week: '/week',
  twelveWeeks: '/twelve-weeks',
  schedules: '/schedules',
  reviews: '/reviews',
  textbooks: '/textbooks',
  wrongExercises: '/wrong-exercises',
  coding: '/coding',
  retrospectives: '/retrospectives',
  dashboard: '/dashboard',
  settings: '/settings',
} as const;

// Main menu (LNB) items, in display order (central menu rule, sirloinbh/project-standards#1128):
// the day log, Week, 12 weeks, the app's other pages, Dashboard, Settings last.
const nav: NavItem[] = [
  { to: pages.logs, label: 'Study log', icon: NotebookPen },
  { to: pages.week, label: 'Week', icon: Rows3 },
  { to: pages.twelveWeeks, label: '12 weeks', icon: Grid3x3 },
  { to: pages.schedules, label: 'Schedules', icon: CalendarDays },
  { to: pages.reviews, label: 'Reviews', icon: CalendarCheck },
  { to: pages.textbooks, label: 'Textbooks', icon: BookOpen },
  { to: pages.wrongExercises, label: 'Wrong problems', icon: CircleX },
  { to: pages.coding, label: 'Algorithms', icon: Code },
  { to: pages.retrospectives, label: 'Retrospectives', icon: NotebookText },
  { to: pages.dashboard, label: 'Dashboard', icon: ChartColumn },
  { to: pages.settings, label: 'Settings', icon: Settings2 },
];

// Page heading and server status. The body does not wait for /api/health: the service date comes
// from the client (date.ts), and the server status line retries by itself while the server is down.
// The body keeps the app's own styles (style.css, scoped to .legacy).
function Page({
  title,
  description,
  health,
  today,
  children,
}: {
  title: string;
  description: string;
  health: Health;
  today: string;
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
      <div className="legacy">{children(today)}</div>
    </section>
  );
}

function AppBody() {
  const health = useHealth();
  const today = useServiceDate();
  // Pages that can change what is due bump this, so the badge counts again without a page change.
  const [reviewVersion, setReviewVersion] = useState(0);
  const reviewsChanged = () => setReviewVersion((version) => version + 1);
  return (
    <BrowserRouter>
      <SignInGate>
        <AppShell
          appName="Study Log"
          nav={nav}
          actions={
            <>
              <ReviewBadge to={pages.reviews} version={reviewVersion} day={today} />
              <AccountActions />
            </>
          }
        >
          <Routes>
            <Route
              path={pages.logs}
              element={
                <Page
                  title="Study log"
                  description="Record the time and topics you studied today and review recent logs"
                  health={health}
                  today={today}
                >
                  {(today) => <StudyLogs today={today} onChange={reviewsChanged} />}
                </Page>
              }
            />
            <Route
              path={pages.week}
              element={
                <Page
                  title="Week"
                  description="See each day of a week: the time studied and the sessions"
                  health={health}
                  today={today}
                >
                  {(today) => <WeekView today={today} />}
                </Page>
              }
            />
            <Route
              path={pages.twelveWeeks}
              element={
                <Page
                  title="12 weeks"
                  description="Compare the study time of the last 12 weeks"
                  health={health}
                  today={today}
                >
                  {(today) => <TwelveWeekView today={today} />}
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
                  today={today}
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
                  today={today}
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
                  today={today}
                >
                  {() => <Textbooks />}
                </Page>
              }
            />
            <Route
              path={pages.coding}
              element={
                <Page
                  title="Algorithms"
                  description="Record the algorithm problems you solve and every attempt at them"
                  health={health}
                  today={today}
                >
                  {(today) => <CodingProblems today={today} onChange={reviewsChanged} />}
                </Page>
              }
            />
            <Route
              path={pages.wrongExercises}
              element={
                <Page
                  title="Wrong problems"
                  description="Practise again the problems whose latest try was wrong or needed a hint"
                  health={health}
                  today={today}
                >
                  {() => <WrongExercises />}
                </Page>
              }
            />
            <Route
              path={pages.dashboard}
              element={
                <Page
                  title="Dashboard"
                  description="See study time by period and the daily average at a glance"
                  health={health}
                  today={today}
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
                  today={today}
                >
                  {(today) => <Retrospectives today={today} />}
                </Page>
              }
            />
            <Route
              path={pages.settings}
              element={
                <Page
                  title="Settings"
                  description="App settings and data management"
                  health={health}
                  today={today}
                >
                  {() => (
                    <>
                      <CalendarSync />
                      <DataExport />
                    </>
                  )}
                </Page>
              }
            />
            {/* The old address of the dashboard keeps working. */}
            <Route path="/stats" element={<Navigate to={pages.dashboard} replace />} />
            <Route path="*" element={<Navigate to={pages.logs} replace />} />
          </Routes>
        </AppShell>
        <Toaster />
      </SignInGate>
    </BrowserRouter>
  );
}

// One query cache for the whole app (#287); a new App (a test render) starts with an empty one.
export function App() {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AppBody />
    </QueryClientProvider>
  );
}
