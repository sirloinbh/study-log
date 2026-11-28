import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { expect, test, vi } from 'vitest';

import {
  busiestFinished,
  finishedBars,
  finishedHeatLevel,
  finishedLabel,
  perDay,
} from './finished-stats';
import { Stats } from './stats';
import { heatWeeks, monthLabel } from './study-stats';
import { type Api, fakeApi } from './test/fake-api';
import { finishedStats } from './test/finished';
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
  type Row = { label: string; chapters: number; sections: number; total: number };
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
            {`${row.label}:${row.chapters}:${row.sections}`}
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
    XAxis: ({ fontSize }: { fontSize?: number }) => <span data-testid="axis-font">{fontSize}</span>,
    YAxis: ({ fontSize }: { fontSize?: number }) => <span data-testid="axis-font">{fontSize}</span>,
    Tooltip: Part,
    Bar: ({ dataKey, stackId }: { dataKey: string; stackId?: string }) => (
      <span data-testid="bar-key">{`${dataKey}:${stackId}`}</span>
    ),
  };
});

const statsFor = (period: string, chapters: number) =>
  finishedStats({
    period,
    from: period === 'week' ? '2026-10-19' : '2026-10-01',
    to: '2026-10-23',
    chapters,
    sections: chapters * 2,
    todayChapters: 1,
    todaySections: 2,
    cumulativeChapters: 7,
    cumulativeSections: 11,
    totalChapters: 9,
    totalSections: 20,
    days: period === 'week' ? 5 : 23,
  });

type Options = {
  // Answers per period; a missing one is a 500.
  totals?: Record<string, number>;
  // Requests for these periods wait for the promise.
  hold?: { periods: string[]; until: Promise<void> };
  // The series every period answers with (#49); empty by default.
  series?: Pick<ReturnType<typeof statsFor>, 'daily' | 'weekly' | 'monthly'>;
  // The heatmap's days, from a Sunday; undefined answers a 500.
  heatmap?: {
    from: string;
    to: string;
    daily: { date: string; chapters: number; sections: number }[];
  } | null;
};

// The stats API.
function server(options: Options = {}) {
  const totals = options.totals ?? { week: 3, month: 8, '3months': 12, all: 12 };
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
    if (path === '/api/stats/finished-days')
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
    const match = path.match(/^\/api\/stats\/finished-contents\?period=(.+)$/);
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
  api.requests.flatMap(
    (r) => r.path.match(/^\/api\/stats\/finished-contents\?period=(.+)$/)?.[1] ?? [],
  );

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
  await screen.findByRole('region', { name: 'Finished metrics' });
  return api;
}

// The finished-trend chart's card; the review chart's card has the same class.
const chart = () =>
  within(document.querySelector<HTMLElement>('section[aria-labelledby="finished-chart-heading"]')!);
// The stand-in chart writes each bar as "label:chapters:sections".
const bars = () =>
  chart()
    .queryAllByTestId('bar')
    .map((b) => b.textContent);

// The chapters and sections finished on each day of the chart (#481).
const series = {
  daily: [
    { date: '2026-10-19', chapters: 0, sections: 0 },
    { date: '2026-10-20', chapters: 1, sections: 1 },
    { date: '2026-10-21', chapters: 2, sections: 1 },
    { date: '2026-10-22', chapters: 0, sections: 1 },
  ],
  weekly: [
    { weekStart: '2026-10-11', chapters: 1, sections: 2 },
    { weekStart: '2026-10-18', chapters: 3, sections: 4 },
  ],
  monthly: [{ month: '2026-10', chapters: 4, sections: 6 }],
};

// A chart that fails to load says so; it runs first because the failed import is the first one.
test('a chart that fails to load says so and keeps the summary sentence', async () => {
  // Recharts comes from a separate file; a failed download rejects the dynamic import.
  server({ series });
  render(<Stats />);
  await screen.findByRole('heading', { name: 'Finished trend' });
  expect(await chart().findByText(/Could not load the chart:/)).toBeVisible();
  expect(chart().getByText(/Most finished in a day of 4 days: 10\/21/)).toBeVisible();
});

test('the dashboard opens on this week with the four metric cards', async () => {
  const api = await openStats();
  expect(askedOf(api)).toEqual(['week']);
  expect(pressed()).toEqual(['This week']);
  expect(cards()).toEqual([
    'Finished so far:7 chapters',
    'Today:1 chapter',
    'This week:3 chapters',
    'Daily average:1.8 a day',
  ]);
  const page = document.body;
  expect(page).toHaveTextContent(/11 sections/);
  expect(page).toHaveTextContent(/Of 9 chapters and 20 sections/);
  expect(page).toHaveTextContent(/6 sections/);
  expect(page).toHaveTextContent(/2026-10-19 ~ 2026-10-23/);
  // The cards hold more than the period (the all-time total), so their group is named neutrally.
  expect(screen.getByRole('region', { name: 'Finished metrics' })).toHaveAccessibleName(
    'Finished metrics',
  );
  // Study time is not shown here; it lives in the daily goal card only.
  expect(screen.getByRole('region', { name: 'Finished metrics' })).not.toHaveTextContent(
    /time|\d h\b/i,
  );
  expect(chart().getByRole('heading', { name: 'Finished trend' })).toBeInTheDocument();
});

test('metric values stay on one line and shrink on a phone (#436)', async () => {
  await openStats();
  const values = document.querySelectorAll('[data-metric-value]');
  expect(values.length).toBeGreaterThan(0);
  for (const value of values) {
    expect(value).toHaveClass('whitespace-nowrap', 'text-[20px]', 'sm:text-[26px]');
  }
});

test('picking a period asks for it and relabels the period card', async () => {
  const api = await openStats();
  pick('This month');
  await waitFor(() => expect(cards()[2]).toBe('This month:8 chapters'));
  expect(askedOf(api)).toEqual(['week', 'month']);
  expect(pressed()).toEqual(['This month']);
  expect(cards()).toEqual([
    'Finished so far:7 chapters',
    'Today:1 chapter',
    'This month:8 chapters',
    'Daily average:1 a day',
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
  await waitFor(() => expect(cards()[2]).toBe('This month:8 chapters'));
  // The late answer arrives. Picking another period afterwards and seeing its cards proves the
  // late one was handled before them, and it left no trace.
  release();
  await until;
  pick('All');
  await waitFor(() => expect(cards()[2]).toBe('All:12 chapters'));
  expect(pressed()).toEqual(['All']);
});

test('a failed load is reported instead of empty cards', async () => {
  await openStats({ totals: { week: 3 } });
  pick('This month');
  expect(await screen.findByText(/Could not load the stats: Server error/)).toBeVisible();
  expect(cards()).toEqual([]);
  expect(document.body).not.toHaveTextContent(/Loading the stats/);
  // Going back to a period that loads shows its cards again.
  pick('This week');
  await waitFor(() => expect(cards()).toHaveLength(4));
});

// Two weeks from Sunday 2026-10-04 to Tuesday 2026-10-13 (#96), one day in each band and one future
// slot short of a full second week. Entries finished per day: 0, 1, 2, 3, 4, 5, 9, 0, 0, 2.
const twoWeeks = {
  from: '2026-10-04',
  to: '2026-10-13',
  daily: [0, 1, 2, 3, 4, 5, 9, 0, 0, 2].map((count, index) => ({
    date: `2026-10-${String(4 + index).padStart(2, '0')}`,
    // The ninth entry of the seventh day is a chapter, the rest are sections.
    chapters: count === 9 ? 1 : 0,
    sections: count === 9 ? 8 : count,
  })),
};

// #405: the heatmap scrolls sideways, so a keyboard must be able to focus it.
test('the heatmap scroll area is a named region that takes keyboard focus', async () => {
  await openStats({ heatmap: twoWeeks });
  const region = await screen.findByRole('region', {
    name: 'Heatmap of the last year, scrolls sideways',
  });
  expect(region).toHaveAttribute('tabindex', '0');
  region.focus();
  expect(region).toHaveFocus();
});

// #411: the labels are 13px, and only every other weekday is named so they fit beside 11px rows.
test('the heatmap labels are 13px and name every other weekday', async () => {
  await openStats({ heatmap: twoWeeks });
  const region = await screen.findByRole('region', {
    name: 'Heatmap of the last year, scrolls sideways',
  });
  const labels = Array.from(region.querySelectorAll('span')).filter(
    (node) => node.textContent && !node.hasAttribute('data-level'),
  );
  expect(
    labels.map((node) => node.textContent).filter((text) => /^[A-Z][a-z]{2}$/.test(text)),
  ).toEqual(['Mon', 'Wed', 'Fri']);
  expect(region.querySelector('[class*="text-[13px]"]')).not.toBeNull();
  expect(region.innerHTML).not.toMatch(/text-\[1[0-2]px\]/);
  expect(region.textContent).not.toMatch(/Tue|Thu|Sat|Sun/);
});

test('the heatmap shows each day in its band with a tooltip, by week columns', async () => {
  await openStats({ heatmap: twoWeeks });
  await screen.findByRole('img');
  const weeks = Array.from(document.querySelectorAll('[data-week]'));
  expect(weeks).toHaveLength(2);
  const cells = (week: Element) =>
    Array.from(week.querySelectorAll('[data-level]')).map((n) => n.getAttribute('data-level'));
  expect(cells(weeks[0])).toEqual(['0', '1', '2', '3', '3', '4', '4']);
  // Sunday to Tuesday, then the rest of this week is empty.
  expect(cells(weeks[1])).toEqual(['0', '0', '2', 'future', 'future', 'future', 'future']);
  expect(document.querySelector('[title="2026-10-09: 0 chapters · 5 sections"]')).not.toBeNull();
  expect(document.querySelector('[title="2026-10-10: 1 chapter · 8 sections"]')).not.toBeNull();
  // One summary for screen readers.
  expect(screen.getByRole('img')).toHaveAccessibleName(
    '2026-10-04 to 2026-10-13: 7 days with a finish · 1 chapter · 25 sections',
  );
  expect(document.body).toHaveTextContent(/7 days with a finish · 1 chapter · 25 sections/);
  const legend = screen.getByRole('list', { name: 'Intensity levels' });
  expect(
    within(legend)
      .getAllByRole('listitem')
      .map((n) => n.textContent),
  ).toEqual(['None', '1 finished', '2 finished', '3–4 finished', '5 or more']);
});

test('a failed heatmap load is reported and the metric cards stay', async () => {
  await openStats({ heatmap: null });
  expect(await screen.findByText(/Could not load the heatmap: Server error/)).toBeVisible();
  expect(cards()).toHaveLength(4);
});

test('heatmap levels, weeks and month labels', () => {
  expect([0, 1, 2, 3, 4, 5, 600].map(finishedHeatLevel)).toEqual([0, 1, 2, 3, 3, 4, 4]);
  const days = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      date: `2026-09-${String(from + i).padStart(2, '0')}`,
      chapters: 0,
      sections: 0,
    }));
  const weeks = heatWeeks(days(21, 9));
  expect(weeks.map((week) => week.filter((day) => day !== null).length)).toEqual([7, 2]);
  expect(monthLabel([{ date: '2026-09-28' }, { date: '2026-10-01' }])).toBe('Oct');
  expect(monthLabel([{ date: '2026-09-21' }, null])).toBe('');
});

test('the chart shows the period by day, with a sentence naming the busiest day', async () => {
  await openStats({ series });
  await chart().findAllByTestId('bar');
  expect(bars()).toEqual(['10/19:0:0', '10/20:1:1', '10/21:2:1', '10/22:0:1']);
  expect(
    chart().getByText(/Most finished in a day of 4 days: 10\/21 \(2 chapters · 1 section\)/),
  ).toBeVisible();
  // The chart sits in an aria-hidden wrapper, so its own keyboard layer must be off (#404).
  expect(chart().getByTestId('bar-chart')).toHaveAttribute('data-accessibility-layer', 'false');
  // Axis labels are at least 13px (#406).
  for (const axis of chart().getAllByTestId('axis-font'))
    expect(Number(axis.textContent)).toBeGreaterThanOrEqual(13);
  // Chapters and sections stack in one bar.
  expect(
    chart()
      .getAllByTestId('bar-key')
      .map((key) => key.textContent),
  ).toEqual(['chapters:finished', 'sections:finished']);
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
  expect(bars()).toEqual(['10/11~:1:2', '10/18~:3:4']);
  expect(chart().getByText(/Most finished in a week of 2 weeks: 10\/18~/)).toBeVisible();
  unit('Month');
  // A single bar still draws and is named.
  expect(bars()).toEqual(['26.10:4:6']);
  expect(
    chart().getByText(/Most finished in a month of 1 month: 26\.10 \(4 chapters · 6 sections\)/),
  ).toBeVisible();
  // Another period starts at its own unit; coming back keeps the pick.
  pick('Last 3 months');
  await waitFor(() => expect(unitPressed()).toEqual(['Week']));
  pick('This week');
  await waitFor(() => expect(unitPressed()).toEqual(['Month']));
});

test('a period without a finished entry says so instead of an empty chart', async () => {
  await openStats();
  expect(chart().getByText(/No chapters or sections were finished in this period/)).toBeVisible();
  expect(chart().queryByTestId('bar-chart')).toBeNull();
  cleanup();
  await openStats({
    series: { daily: [{ date: '2026-10-19', chapters: 0, sections: 0 }], weekly: [], monthly: [] },
  });
  expect(chart().getByText(/No chapters or sections were finished in this period/)).toBeVisible();
});

test('chart bars, labels, the busiest bar and the daily average', () => {
  const stats = {
    ...statsFor('all', 0),
    ...series,
    monthly: [{ month: '2025-12', chapters: 1, sections: 3 }],
  };
  expect(finishedBars(stats as never, 'month')).toEqual([
    { key: '2025-12', label: '25.12', chapters: 1, sections: 3, total: 4 },
  ]);
  // A tie goes to the earlier bar; nothing finished has no busiest bar.
  const tie = busiestFinished([
    { total: 3, key: 'a' },
    { total: 3, key: 'b' },
  ] as never);
  expect(tie?.key).toBe('a');
  expect(busiestFinished([{ total: 0 }] as never)).toBeUndefined();
  expect(busiestFinished([])).toBeUndefined();
  expect(finishedLabel({ chapters: 1, sections: 2 })).toBe('1 chapter · 2 sections');
  expect([perDay(9, 5), perDay(1, 3), perDay(0, 0), perDay(6, 3)]).toEqual([
    '1.8',
    '0.3',
    '0',
    '2',
  ]);
});
