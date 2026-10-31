import {
  BookOpen,
  CalendarCheck,
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
import { Keywords } from './Keywords';
import { Retrospectives } from './Retrospectives';
import { ReviewBadge } from './review-badge';
import { Reviews } from './reviews';
import { Stats } from './Stats';
import { StudyLogs } from './StudyLogs';
import { Textbooks } from './Textbooks';

// Every page URL lives here (central docs/directory-rules.md). The study log is the first page.
const pages = {
  logs: '/',
  reviews: '/reviews',
  textbooks: '/textbooks',
  keywords: '/keywords',
  stats: '/stats',
  retrospectives: '/retrospectives',
  settings: '/settings',
} as const;

// Main menu (LNB) items, in display order.
const nav: NavItem[] = [
  { to: pages.logs, label: '학습 기록', icon: NotebookPen },
  { to: pages.reviews, label: '복습', icon: CalendarCheck },
  { to: pages.textbooks, label: '교재', icon: BookOpen },
  { to: pages.keywords, label: '키워드', icon: Tags },
  { to: pages.stats, label: '통계', icon: ChartColumn },
  { to: pages.retrospectives, label: '회고', icon: NotebookText },
  { to: pages.settings, label: '설정', icon: Settings2 },
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
            : { state: 'error', message: data.error ?? '서버 상태를 확인할 수 없습니다' },
        );
      })
      .catch(() => setHealth({ state: 'error', message: '서버에 연결할 수 없습니다' }));
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
        appName="공부 기록"
        nav={nav}
        actions={<ReviewBadge to={pages.reviews} version={reviewVersion} />}
      >
        <Routes>
          <Route
            path={pages.logs}
            element={
              <Page
                title="학습 기록"
                description="오늘 공부한 시간과 내용을 기록하고 최근 기록을 확인합니다"
                health={health}
              >
                {(today) => <StudyLogs today={today} onChange={reviewsChanged} />}
              </Page>
            }
          />
          <Route
            path={pages.reviews}
            element={
              <Page
                title="복습"
                description="오늘 복습할 내용을 확인하고 끝낸 복습을 완료로 표시합니다"
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
                title="교재"
                description="공부할 교재를 등록하고 제목·저자·판본을 관리합니다"
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
                title="키워드"
                description="공부하며 만난 중요한 키워드를 날짜별로 남기고 다시 찾습니다"
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
                title="통계"
                description="기간별 학습 시간과 하루 평균을 한눈에 봅니다"
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
                title="회고"
                description="한 주와 한 달의 공부를 돌아보며 회고를 남깁니다"
                health={health}
              >
                {(today) => <Retrospectives today={today} />}
              </Page>
            }
          />
          <Route
            path={pages.settings}
            element={
              <Page title="설정" description="앱 환경과 데이터 관리" health={health}>
                {() => (
                  <EmptyState
                    title="아직 설정 항목이 없습니다"
                    description="설정은 관련 이슈 카드에서 추가합니다."
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
