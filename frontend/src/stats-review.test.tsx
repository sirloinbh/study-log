import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { Stats } from './stats';
import { reviewBars, studyTimePath } from './study-stats';

// The chart library is slow to load and draws nothing without a real layout; the page is checked
// in a browser instead.
vi.mock('recharts', () => {
  const Part = () => null;
  return {
    ResponsiveContainer: Part,
    BarChart: Part,
    CartesianGrid: Part,
    XAxis: Part,
    YAxis: Part,
    Tooltip: Part,
    Bar: Part,
  };
});

// The whole dashboard renders here and role queries are slow, most of all on the first run after a
// change, when these tests can take longer than the usual limit.
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 10_000 });

const studyTime = (totalMinutes: number) => ({
  period: 'week',
  from: '2026-10-25',
  to: '2026-10-31',
  totalMinutes,
  todayMinutes: 0,
  cumulativeMinutes: totalMinutes,
  days: 7,
  studyDays: 1,
  averageMinutesPerDay: 0,
  averageMinutesPerStudyDay: 0,
  daily: [],
  weekly: [],
  monthly: [],
});

const reviews = {
  period: 'week',
  from: '2026-10-25',
  to: '2026-10-31',
  scheduled: 4,
  completed: 3,
  delayed: 2,
  completionRate: 75,
};

function server(answers: { reviews?: unknown; reviewsStatus?: number } = {}) {
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      asked.push(url);
      if (url.startsWith('/api/stats/reviews'))
        return Promise.resolve(
          answers.reviewsStatus
            ? new Response(JSON.stringify({ error: '서버 오류' }), {
                status: answers.reviewsStatus,
              })
            : new Response(JSON.stringify(answers.reviews ?? reviews)),
        );
      if (url.startsWith('/api/stats/heatmap'))
        return Promise.resolve(
          new Response(JSON.stringify({ from: '2026-10-25', to: '2026-10-31', daily: [] })),
        );
      return Promise.resolve(
        new Response(JSON.stringify(studyTime(url.includes('type=review') ? 40 : 100))),
      );
    }),
  );
  return asked;
}

const reviewCard = () => within(document.querySelector<HTMLElement>('.review-chart')!);

test('the completion rate and its counts are shown for the period', async () => {
  server();
  render(<Stats />);
  expect(await reviewCard().findByText('75%')).toBeTruthy();
  expect(reviewCard().getByRole('heading', { name: '복습 완료율' })).toBeTruthy();
  expect(reviewCard().getByText(/이번 주 예정 4회 중 3회 완료, 지연 2회입니다/)).toBeTruthy();
});

test('picking a period asks for its reviews too', async () => {
  const asked = server();
  render(<Stats />);
  await reviewCard().findByText('75%');
  fireEvent.click(
    within(screen.getByRole('group', { name: '기간' })).getByRole('button', { name: '이번 달' }),
  );
  await waitFor(() => expect(asked).toContain('/api/stats/reviews?period=month'));
});

test('a period without scheduled reviews says so instead of a rate', async () => {
  server({ reviews: { ...reviews, scheduled: 0, completed: 0, delayed: 0, completionRate: null } });
  render(<Stats />);
  expect(await reviewCard().findByText('이번 주에는 예정된 복습이 없습니다')).toBeTruthy();
  expect(reviewCard().queryByText(/%$/)).toBeNull();
});

test('a failed review load stays inside its card', async () => {
  server({ reviewsStatus: 500 });
  render(<Stats />);
  expect(await reviewCard().findByRole('alert')).toBeTruthy();
  expect(await screen.findByRole('region', { name: '학습 시간 지표' })).toBeTruthy();
});

test('the study type filter narrows study time and leaves reviews alone', async () => {
  const asked = server();
  render(<Stats />);
  const metrics = await screen.findByRole('region', { name: '학습 시간 지표' });
  await within(metrics).findAllByText('1시간 40분');
  await reviewCard().findByText('75%');
  const reviewAsks = asked.filter((url) => url.startsWith('/api/stats/reviews')).length;

  const types = within(screen.getByRole('group', { name: '학습 유형' }));
  expect(types.getByRole('button', { name: '전체' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(types.getByRole('button', { name: '복습' }));

  await waitFor(() => expect(asked).toContain('/api/stats/study-time?period=week&type=review'));
  const narrowed = await screen.findByRole('region', { name: '학습 시간 지표' });
  expect((await within(narrowed).findAllByText('40분')).length).toBeGreaterThan(0);
  expect(within(narrowed).getByText('지금까지 기록한 복습')).toBeTruthy();
  expect(asked.filter((url) => url.startsWith('/api/stats/reviews')).length).toBe(reviewAsks);
  expect(reviewCard().getByText('75%')).toBeTruthy();
});

test('the request leaves out the type when everything is wanted', () => {
  expect(studyTimePath('week', 'all')).toBe('/api/stats/study-time?period=week');
  expect(studyTimePath('all', 'new')).toBe('/api/stats/study-time?period=all&type=new');
});

test('the bars are the three counts, in order', () => {
  expect(
    reviewBars({ ...reviews, delayed: 0 } as never).map((bar) => `${bar.label}:${bar.count}`),
  ).toEqual(['예정 4회:4', '완료 3회:3', '지연 0회:0']);
});
