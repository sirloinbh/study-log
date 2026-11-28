import { fireEvent, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { finishedPath } from './finished-stats';
import { Stats } from './stats';
import { reviewBars } from './study-stats';
import { fakeApi } from './test/fake-api';
import { finishedDays, finishedStats } from './test/finished';
import { render } from './test/render';

// The chart library is slow to load and draws nothing without a real layout; the page is checked
// in a browser instead.
vi.mock('recharts', () => {
  const Part = () => null;
  const Group = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Group,
    BarChart: ({
      accessibilityLayer,
      children,
    }: {
      accessibilityLayer?: boolean;
      children?: React.ReactNode;
    }) => (
      <div data-testid="review-chart" data-accessibility-layer={String(accessibilityLayer)}>
        {children}
      </div>
    ),
    CartesianGrid: Part,
    XAxis: ({ fontSize }: { fontSize?: number }) => <span data-testid="axis-font">{fontSize}</span>,
    YAxis: Part,
    Tooltip: Part,
    Bar: Part,
  };
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
  return fakeApi({
    'GET /api/textbooks': { body: { textbooks: [] } },
    'GET /api/stats/reviews': answers.reviewsStatus
      ? { status: answers.reviewsStatus, body: { error: 'Server error' } }
      : { body: answers.reviews ?? reviews },
    'GET /api/stats/finished-days': { body: finishedDays() },
    'GET /api/stats/textbooks': {
      body: {
        textbooks: [],
        schedule: {
          plannedMinutes: 0,
          achievedMinutes: 0,
          achievementRate: null,
          dueDays: 0,
          onTimeDays: 0,
          adherenceRate: null,
        },
      },
    },
    'GET /api/stats/finished-contents': { body: finishedStats({ chapters: 2, sections: 3 }) },
  });
}

const reviewCard = () =>
  within(document.querySelector<HTMLElement>('section[aria-labelledby="review-chart-heading"]')!);

test('the completion rate and its counts are shown for the period', async () => {
  server();
  render(<Stats />);
  expect(await reviewCard().findByText('75%')).toBeTruthy();
  expect(reviewCard().getByRole('heading', { name: 'Review completion rate' })).toBeTruthy();
  expect(
    reviewCard().getByText(/This week: 3 of 4 scheduled reviews completed, 2 delayed/),
  ).toBeTruthy();
  // The chart sits in an aria-hidden wrapper, so its own keyboard layer must be off (#404).
  expect(await reviewCard().findByTestId('review-chart')).toHaveAttribute(
    'data-accessibility-layer',
    'false',
  );
  // The labels carry the counts, so they are at least 13px (#406).
  expect(Number(reviewCard().getByTestId('axis-font').textContent)).toBeGreaterThanOrEqual(13);
});

test('the page holds the card of textbooks and schedules', async () => {
  server();
  render(<Stats />);
  expect(
    await screen.findByRole('region', { name: 'Textbooks and schedules' }),
  ).toBeInTheDocument();
});

test('picking a period asks for its reviews too', async () => {
  const api = server();
  render(<Stats />);
  await reviewCard().findByText('75%');
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Period' })).getByRole('button', {
      name: 'This month',
    }),
  );
  await api.requested((r) => r.path === '/api/stats/reviews?period=month');
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
  expect(await screen.findByRole('region', { name: 'Finished metrics' })).toBeTruthy();
});

test('the request asks for the period and leaves out the textbook when all are wanted', () => {
  expect(finishedPath('week')).toBe('/api/stats/finished-contents?period=week');
  expect(finishedPath('all', '7')).toBe('/api/stats/finished-contents?period=all&textbookId=7');
});

test('the bars are the three counts, in order', () => {
  expect(
    reviewBars({ ...reviews, delayed: 0 } as never).map((bar) => `${bar.label}:${bar.count}`),
  ).toEqual(['Scheduled 4:4', 'Done 3:3', 'Delayed 0:0']);
});
