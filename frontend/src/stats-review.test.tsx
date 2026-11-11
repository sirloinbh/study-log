import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
            ? new Response(JSON.stringify({ error: 'Server error' }), {
                status: answers.reviewsStatus,
              })
            : new Response(JSON.stringify(answers.reviews ?? reviews)),
        );
      if (url.startsWith('/api/stats/heatmap'))
        return Promise.resolve(
          new Response(JSON.stringify({ from: '2026-10-25', to: '2026-10-31', daily: [] })),
        );
      if (url.startsWith('/api/stats/textbooks'))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              textbooks: [],
              schedule: {
                plannedMinutes: 0,
                achievedMinutes: 0,
                achievementRate: null,
                dueDays: 0,
                onTimeDays: 0,
                adherenceRate: null,
              },
            }),
          ),
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
  expect(reviewCard().getByRole('heading', { name: 'Review completion rate' })).toBeTruthy();
  expect(
    reviewCard().getByText(/This week: 3 of 4 scheduled reviews completed, 2 delayed/),
  ).toBeTruthy();
});

test('the page holds the card of textbooks and schedules', async () => {
  server();
  render(<Stats />);
  expect(
    await screen.findByRole('region', { name: 'Textbooks and schedules' }),
  ).toBeInTheDocument();
});

test('picking a period asks for its reviews too', async () => {
  const asked = server();
  render(<Stats />);
  await reviewCard().findByText('75%');
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Period' })).getByRole('button', {
      name: 'This month',
    }),
  );
  await waitFor(() => expect(asked).toContain('/api/stats/reviews?period=month'));
});

test('a period without scheduled reviews says so instead of a rate', async () => {
  server({ reviews: { ...reviews, scheduled: 0, completed: 0, delayed: 0, completionRate: null } });
  render(<Stats />);
  expect(await reviewCard().findByText('No reviews were scheduled for this week')).toBeTruthy();
  expect(reviewCard().queryByText(/%$/)).toBeNull();
});

test('a failed review load stays inside its card', async () => {
  server({ reviewsStatus: 500 });
  render(<Stats />);
  expect(await reviewCard().findByRole('alert')).toBeTruthy();
  expect(await screen.findByRole('region', { name: 'Study time metrics' })).toBeTruthy();
});

test('the study type filter narrows study time and leaves reviews alone', async () => {
  const asked = server();
  render(<Stats />);
  const metrics = await screen.findByRole('region', { name: 'Study time metrics' });
  await within(metrics).findAllByText('1 h 40 min');
  await reviewCard().findByText('75%');
  const reviewAsks = asked.filter((url) => url.startsWith('/api/stats/reviews')).length;

  const types = within(screen.getByRole('group', { name: 'Study type' }));
  expect(types.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(types.getByRole('button', { name: 'Review' }));

  await waitFor(() => expect(asked).toContain('/api/stats/study-time?period=week&type=review'));
  const narrowed = await screen.findByRole('region', { name: 'Study time metrics' });
  expect((await within(narrowed).findAllByText('40 min')).length).toBeGreaterThan(0);
  expect(within(narrowed).getByText('Recorded so far: Review')).toBeTruthy();
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
  ).toEqual(['Scheduled 4:4', 'Done 3:3', 'Delayed 0:0']);
});
