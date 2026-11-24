import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vitest';

import { Stats } from './stats';
import { busiestBar, chartBars, heatLevel, heatWeeks, monthLabel } from './study-stats';
import { type Api, fakeApi } from './test/fake-api';
import { render } from './test/render';

// Recharts draws nothing without a real layout, so a stand-in writes what it was given into the
// page: each bar's label and values, the bar's data key and the tooltip's formatted text. The
// first import fails, as a failed download of the chart file does.
const chartDownload = vi.hoisted(() => ({ fails: true }));
vi.mock('recharts', () => {
  if (chartDownload.fails) {
    chartDownload.fails = false;
    throw new Error('Failed to fetch dynamically imported module');
  }
  type Row = { label: string; minutes: number; hours: number };
  const Part = () => null;
  const Group = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const BarChart = ({
    data,
    children,
    accessibilityLayer,
  }: {
    data: Row[];
    children?: React.ReactNode;
    accessibilityLayer?: boolean;
  }) => {
    return (
      <div data-testid="bar-chart" data-accessibility-layer={String(accessibilityLayer)}>
        {data.map((row) => (
          <span key={row.label} data-testid="bar">
            {`${row.label}:${row.hours}:${row.minutes}`}
          </span>
        ))}
        {children}
      </div>
    );
  };
  return {
    ResponsiveContainer: Group,
    BarChart,
    CartesianGrid: Part,
    XAxis: Part,
    YAxis: Part,
    Tooltip: ({ formatter }: { formatter: (v: number, n: string, i: unknown) => unknown }) => (
      <span data-testid="tooltip">
        {JSON.stringify(formatter(2.5, 'hours', { payload: { minutes: 150 } }))}
      </span>
    ),
    Bar: ({ dataKey }: { dataKey: string }) => <span data-testid="bar-key">{dataKey}</span>,
  };
});

const statsFor = (period: string, totalMinutes: number) => ({
  period,
  from: period === 'week' ? '2026-10-19' : '2026-10-01',
  to: '2026-10-23',
  totalMinutes,
  todayMinutes: 90,
  cumulativeMinutes: 665,
  days: period === 'week' ? 5 : 23,
  studyDays: period === 'week' ? 3 : 5,
  averageMinutesPerDay: period === 'week' ? 57 : 21,
  averageMinutesPerStudyDay: period === 'week' ? 95 : 97,
  daily: [] as { date: string; minutes: number }[],
  weekly: [] as { weekStart: string; minutes: number }[],
  monthly: [] as { month: string; minutes: number }[],
});

type Options = {
  // Answers per period; a missing one is a 500.
  totals?: Record<string, number>;
  // Requests for these periods wait for the promise.
  hold?: { periods: string[]; until: Promise<void> };
  // The series every period answers with (#49); empty by default.
  series?: Pick<ReturnType<typeof statsFor>, 'daily' | 'weekly' | 'monthly'>;
  // The heatmap's days, from a Sunday; undefined answers a 500.
  heatmap?: { from: string; to: string; daily: { date: string; minutes: number }[] } | null;
};

// The stats API.
function server(options: Options = {}) {
  const totals = options.totals ?? { week: 285, month: 485, '3months': 665, all: 665 };
  const hold = options.hold;
  return fakeApi(({ path }) => {
    if (path.startsWith('/api/study-logs')) return { body: { studyLogs: [] } };
    if (path === '/api/textbooks') return { body: { textbooks: [] } };
    if (path.startsWith('/api/stats/textbooks'))
      return {
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
      };
    if (path === '/api/stats/heatmap')
      return options.heatmap === null
        ? { status: 500, body: { error: 'Server error' } }
        : { body: options.heatmap ?? { from: '2026-10-19', to: '2026-10-19', daily: [] } };
    if (path.startsWith('/api/stats/reviews'))
      return {
        body: {
          period: 'week',
          from: '2026-10-19',
          to: '2026-10-23',
          scheduled: 0,
          completed: 0,
          delayed: 0,
          completionRate: null,
        },
      };
    const match = path.match(/^\/api\/stats\/study-time\?period=(.+)$/);
    if (!match) return undefined;
    const period = match[1];
    // A held period answers late, when the test releases it.
    const held = hold?.periods.includes(period) ? { hold: hold.until } : {};
    return period in totals
      ? { body: { ...statsFor(period, totals[period]), ...options.series }, ...held }
      : { status: 500, body: { error: 'Server error' }, ...held };
  });
}

// The periods asked for, in order.
const askedOf = (api: Api) =>
  api.requests.flatMap((r) => r.path.match(/^\/api\/stats\/study-time\?period=(.+)$/)?.[1] ?? []);

// Each metric card as "title:value".
const cards = () =>
  Array.from(document.querySelectorAll('[data-metric]')).map(
    (card) =>
      `${card.querySelector('h2')!.textContent}:${card.querySelector('[data-metric-value]')!.textContent}`,
  );
const periodGroup = () => screen.getByRole('group', { name: 'Period' });
// The pressed period button; the chart's unit buttons are not periods.
const pressed = () =>
  within(periodGroup())
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent);
const pick = (label: string) =>
  fireEvent.click(within(periodGroup()).getByRole('button', { name: label }));

async function openStats(options?: Options) {
  const api = server(options);
  render(<Stats />);
  await screen.findByRole('region', { name: 'Study time metrics' });
  return api;
}

// A chart that fails to load says so; it runs first because the failed import is the first one.
test('a chart that fails to load says so and keeps the summary sentence', async () => {
  // Recharts comes from a separate file; a failed download rejects the dynamic import.
  server({ series });
  render(<Stats />);
  await screen.findByRole('heading', { name: 'Study time trend' });
  expect(await chart().findByText(/Could not load the chart:/)).toBeVisible();
  expect(chart().getByText(/Busiest day of 4 days: 10\/21/)).toBeVisible();
});

test('the dashboard opens on this week with the four metric cards', async () => {
  const api = await openStats();
  expect(askedOf(api)).toEqual(['week']);
  expect(pressed()).toEqual(['This week']);
  expect(cards()).toEqual([
    'Total study time:11 h 5 min',
    'Today:1 h 30 min',
    'This week:4 h 45 min',
    'Daily average:57 min',
  ]);
  const page = document.body;
  expect(page).toHaveTextContent(/2026-10-19 ~ 2026-10-23/);
  expect(page).toHaveTextContent(/3 of 5 days studied/);
  expect(page).toHaveTextContent(/Study days only: 1 h 35 min/);
  // The cards hold more than the period (the all-time total), so their group is named neutrally.
  expect(screen.getByRole('region', { name: 'Study time metrics' })).toHaveAccessibleName(
    'Study time metrics',
  );
});

test('picking a period asks for it and relabels the period card', async () => {
  const api = await openStats();
  pick('This month');
  await waitFor(() => expect(cards()[2]).toBe('This month:8 h 5 min'));
  expect(askedOf(api)).toEqual(['week', 'month']);
  expect(pressed()).toEqual(['This month']);
  expect(cards()).toEqual([
    'Total study time:11 h 5 min',
    'Today:1 h 30 min',
    'This month:8 h 5 min',
    'Daily average:21 min',
  ]);
  expect(document.body).toHaveTextContent(/Based on This month/);
  for (const [label, period] of [
    ['Last 3 months', '3months'],
    ['All', 'all'],
  ]) {
    pick(label);
    await waitFor(() => expect(askedOf(api).at(-1)).toBe(period));
  }
});

test("a slow answer for the previous period is not shown as the new one's", async () => {
  let release = () => {};
  const until = new Promise<void>((r) => (release = r));
  server({ hold: { periods: ['week'], until } });
  render(<Stats />);
  // Announced while waiting, so the change to the cards is not silent.
  await waitFor(() => expect(screen.getAllByRole('status').at(-1)).toHaveTextContent(/Loading/));
  pick('This month');
  await waitFor(() => expect(cards()[2]).toBe('This month:8 h 5 min'));
  // The late answer arrives. Picking another period afterwards and seeing its cards proves the
  // late one was handled before them, and it left no trace.
  release();
  await until;
  pick('All');
  await waitFor(() => expect(cards()[2]).toBe('All:11 h 5 min'));
  expect(pressed()).toEqual(['All']);
});

test('a failed load is reported instead of empty cards', async () => {
  await openStats({ totals: { week: 285 } });
  pick('This month');
  expect(await screen.findByText(/Could not load the stats: Server error/)).toBeVisible();
  expect(cards()).toEqual([]);
  expect(document.body).not.toHaveTextContent(/Loading the stats/);
  // Going back to a period that loads shows its cards again.
  pick('This week');
  await waitFor(() => expect(cards()).toHaveLength(4));
});

// Two weeks from Sunday 2026-10-04 to Tuesday 2026-10-13 (#96), one day in each band and one future
// slot short of a full second week.
const twoWeeks = {
  from: '2026-10-04',
  to: '2026-10-13',
  daily: [0, 10, 30, 59, 60, 119, 120, 0, 0, 45].map((minutes, index) => ({
    date: `2026-10-${String(4 + index).padStart(2, '0')}`,
    minutes,
  })),
};

test('the heatmap shows each day in its band with a tooltip, by week columns', async () => {
  await openStats({ heatmap: twoWeeks });
  await screen.findByRole('img');
  const weeks = Array.from(document.querySelectorAll('[data-week]'));
  expect(weeks).toHaveLength(2);
  const cells = (week: Element) =>
    Array.from(week.querySelectorAll('[data-level]')).map((n) => n.getAttribute('data-level'));
  expect(cells(weeks[0])).toEqual(['0', '1', '2', '2', '3', '3', '4']);
  // Sunday to Tuesday, then the rest of this week is empty.
  expect(cells(weeks[1])).toEqual(['0', '0', '2', 'future', 'future', 'future', 'future']);
  expect(document.querySelector('[title="2026-10-09: 1 h 59 min"]')).not.toBeNull();
  // One summary for screen readers.
  expect(screen.getByRole('img')).toHaveAccessibleName(
    '2026-10-04 to 2026-10-13: 7 study days, total 7 h 23 min',
  );
  expect(document.body).toHaveTextContent(/7 study days · total 7 h 23 min/);
  const legend = screen.getByRole('list', { name: 'Intensity levels' });
  expect(
    within(legend)
      .getAllByRole('listitem')
      .map((n) => n.textContent),
  ).toEqual(['0 min', 'Under 30 min', '30 min–1 h', '1–2 h', '2 h or more']);
});

test('a failed heatmap load is reported and the metric cards stay', async () => {
  await openStats({ heatmap: null });
  expect(await screen.findByText(/Could not load the heatmap: Server error/)).toBeVisible();
  expect(cards()).toHaveLength(4);
});

test('heatmap levels, weeks and month labels', () => {
  expect([0, 1, 29, 30, 59, 60, 119, 120, 600].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  const days = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      date: `2026-09-${String(from + i).padStart(2, '0')}`,
      minutes: 0,
    }));
  const weeks = heatWeeks(days(21, 9));
  expect(weeks.map((week) => week.filter((day) => day !== null).length)).toEqual([7, 2]);
  expect(
    monthLabel([
      { date: '2026-09-28', minutes: 0 },
      { date: '2026-10-01', minutes: 0 },
    ]),
  ).toBe('Oct');
  expect(monthLabel([{ date: '2026-09-21', minutes: 0 }, null])).toBe('');
});

// #49: the study time chart.
const series = {
  daily: [
    { date: '2026-10-19', minutes: 0 },
    { date: '2026-10-20', minutes: 90 },
    { date: '2026-10-21', minutes: 150 },
    { date: '2026-10-22', minutes: 45 },
  ],
  weekly: [
    { weekStart: '2026-10-11', minutes: 200 },
    { weekStart: '2026-10-18', minutes: 285 },
  ],
  monthly: [{ month: '2026-10', minutes: 485 }],
};
// The study time chart's card; the review chart's card has the same class.
const chart = () =>
  within(document.querySelector<HTMLElement>('section[aria-labelledby="study-chart-heading"]')!);
// The stand-in chart writes each bar as "label:hours:minutes".
const bars = () =>
  chart()
    .queryAllByTestId('bar')
    .map((b) => b.textContent);

test('the chart shows the period by day, with a sentence naming the busiest day', async () => {
  await openStats({ series });
  await chart().findAllByTestId('bar');
  expect(
    chart()
      .getAllByTestId('bar')
      .map((b) => b.textContent.split(':').slice(0, 2).join(':')),
  ).toEqual(['10/19:0', '10/20:1.5', '10/21:2.5', '10/22:0.8']);
  expect(chart().getByText(/Busiest day of 4 days: 10\/21 \(2 h 30 min\)/)).toBeVisible();
  // The chart sits in an aria-hidden wrapper, so its own keyboard layer must be off (#404).
  expect(chart().getByTestId('bar-chart')).toHaveAttribute('data-accessibility-layer', 'false');
  // Bars show hours; the tooltip shows the exact minutes.
  expect(chart().getByTestId('bar-key')).toHaveTextContent('hours');
  expect(JSON.parse(chart().getByTestId('tooltip').textContent)).toEqual([
    '2 h 30 min',
    'Study time',
  ]);
});

test('the chart switches between days, weeks and months and remembers it per period', async () => {
  await openStats({ series });
  await chart().findAllByTestId('bar');
  const unitPressed = () =>
    chart()
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent);
  const unit = (label: string) => fireEvent.click(chart().getByRole('button', { name: label }));
  expect(unitPressed()).toEqual(['Day']);
  unit('Week');
  expect(unitPressed()).toEqual(['Week']);
  expect(bars()).toEqual(['10/11~:3.3:200', '10/18~:4.8:285']);
  expect(chart().getByText(/Busiest week of 2 weeks: 10\/18~/)).toBeVisible();
  unit('Month');
  // A single bar still draws and is named.
  expect(bars()).toEqual(['26.10:8.1:485']);
  expect(chart().getByText(/Busiest month of 1 month: 26\.10 \(8 h 5 min\)/)).toBeVisible();
  // Another period starts at its own unit; coming back keeps the pick.
  pick('Last 3 months');
  await waitFor(() => expect(unitPressed()).toEqual(['Week']));
  pick('This week');
  await waitFor(() => expect(unitPressed()).toEqual(['Month']));
});

test('a period without study says so instead of an empty chart', async () => {
  await openStats();
  expect(chart().getByText(/There are no study logs in this period/)).toBeVisible();
  expect(chart().queryByTestId('bar-chart')).toBeNull();
  cleanup();
  await openStats({
    series: { daily: [{ date: '2026-10-19', minutes: 0 }], weekly: [], monthly: [] },
  });
  expect(chart().getByText(/There are no study logs in this period/)).toBeVisible();
});

test('chart bars, labels and the busiest bar', () => {
  const stats = { ...statsFor('all', 0), ...series, monthly: [{ month: '2025-12', minutes: 61 }] };
  expect(chartBars(stats as never, 'month')).toEqual([
    { key: '2025-12', label: '25.12', minutes: 61, hours: 1 },
  ]);
  // A tie goes to the earlier bar; nothing studied has no busiest bar.
  const tie = busiestBar([
    { minutes: 30, key: 'a' },
    { minutes: 30, key: 'b' },
  ] as never);
  expect(tie?.key).toBe('a');
  expect(busiestBar([{ minutes: 0 }] as never)).toBeUndefined();
  expect(busiestBar([])).toBeUndefined();
});
