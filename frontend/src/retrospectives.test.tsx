import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { periodTitle, shiftDays, shiftPeriod } from './retrospective';
import { Retrospectives } from './retrospectives';
import { barWidth, hourLabel } from './study-stats';

vi.setConfig({ testTimeout: 60_000 });

const today = '2026-10-23'; // a Friday; its week is Sunday 10-18 to Saturday 10-24

type Retro = {
  id: number;
  kind: string;
  from: string;
  to: string;
  body: string;
  updatedAt: string;
};

const periodOf = (kind: string, date: string) => {
  if (kind === 'weekly') {
    const from = shiftDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
    return { from, to: shiftDays(from, 6) };
  }
  const [year, month] = date.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${date.slice(0, 7)}-01`, to: `${date.slice(0, 7)}-${last}` };
};

const emptyPattern = {
  totalMinutes: 0,
  byHour: Array(24).fill(0),
  byWeekday: Array(7).fill(0),
  topHour: null,
  topWeekday: null,
};

type Options = {
  failPeriod?: boolean;
  failReload?: boolean;
  // The pattern answered for every period; null answers a 500.
  pattern?: Record<string, unknown> | null;
};

// The retrospective API in memory; records period requests and writes.
function server(initial: Retro[] = [], options: Options = {}) {
  const rows = initial.map((row) => ({ ...row }));
  const periods: string[] = [];
  const patterns: string[] = [];
  const writes: { method: string; path: string; body?: unknown }[] = [];
  let nextId = 100;
  const reply = (status: number, body?: unknown) =>
    new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status });
  const handle = (path: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const pattern = path.match(/^\/api\/stats\/patterns\?from=(.+)&to=(.+)$/);
    if (pattern) {
      patterns.push(`${pattern[1]}~${pattern[2]}`);
      return options.pattern === null
        ? reply(500, { error: 'Server error' })
        : reply(200, { from: pattern[1], to: pattern[2], ...(options.pattern ?? emptyPattern) });
    }
    const period = path.match(/^\/api\/retrospectives\/period\?kind=(\w+)&date=(.+)$/);
    if (period) {
      periods.push(`${period[1]}:${period[2]}`);
      if (options.failPeriod) return reply(500, { error: 'Server error' });
      if (options.failReload && periods.length > 1) return reply(500, { error: 'Server error' });
      const { from, to } = periodOf(period[1], period[2]);
      return reply(200, {
        kind: period[1],
        from,
        to,
        retrospective: rows.find((r) => r.kind === period[1] && r.from === from) ?? null,
        summary: { totalMinutes: 270, studyDays: 2, logs: 3, goalsAchieved: 1, goalsChecked: 2 },
      });
    }
    if (path.startsWith('/api/retrospectives?'))
      return reply(200, {
        retrospectives: [...rows].sort((a, b) => b.from.localeCompare(a.from)),
      });
    const one = path.match(/^\/api\/retrospectives\/(\w+)\/(.+)$/);
    if (!one) throw new Error('unexpected request ' + path);
    const body = init?.body === undefined ? undefined : JSON.parse(init.body);
    writes.push({ method, path, body });
    const index = rows.findIndex((r) => r.kind === one[1] && r.from === one[2]);
    if (method === 'DELETE') {
      if (index < 0) return reply(404, { error: 'Retrospective not found' });
      rows.splice(index, 1);
      return reply(204);
    }
    const { to } = periodOf(one[1], one[2]);
    const saved = {
      id: index < 0 ? nextId++ : rows[index].id,
      kind: one[1],
      from: one[2],
      to,
      body: body.body,
      updatedAt: '2026-10-23 21:00',
    };
    if (index < 0) rows.push(saved);
    else rows[index] = saved;
    return reply(200, { retrospective: saved });
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((...args: Parameters<typeof handle>) => Promise.resolve(handle(...args))),
  );
  return { periods, writes, rows, patterns };
}

const writerEl = () => screen.getByRole('region', { name: 'Write a retrospective' });
const writer = () => within(writerEl());
const headingEl = () => writerEl().querySelector('h2');
const heading = () => headingEl()?.textContent;
const field = () => writerEl().querySelector('textarea');
const type = (value: string) =>
  fireEvent.change(writer().getByLabelText('Retrospective'), { target: { value } });
const expectHeading = (title: string) => waitFor(() => expect(heading()).toBe(title));
const submit = () => fireEvent.submit(writerEl().querySelector('form')!);

// Clicks the button once it is enabled, then waits for the heading to change.
async function move(name: string, title: string) {
  const button = await writer().findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await expectHeading(title);
}

// Records the ids of focused elements (an id with no element never records anything).
const recordFocus = () => {
  const focused: string[] = [];
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement) {
    focused.push(this.id);
  });
  return focused;
};

async function open(initial: Retro[] = [], options: Options = {}) {
  const api = server(initial, options);
  render(<Retrospectives today={today} />);
  await screen.findByRole('region', { name: 'Write a retrospective' });
  return api;
}

const patternEl = () => screen.getByRole('region', { name: 'Study pattern' });

describe('retrospectives', () => {
  test("the page opens on this week's retrospective with the week's study summary", async () => {
    const api = await open();
    await expectHeading('Oct 18 – Oct 24, 2026 Weekly retrospective');
    expect(api.periods).toEqual([`weekly:${today}`]);
    const summary = writerEl().querySelector('.retro-summary')!;
    expect(summary).toHaveTextContent(/Study time4 h 30 min/);
    expect(summary).toHaveTextContent(/Study days2/);
    expect(summary).toHaveTextContent(/Study logs3/);
    expect(summary).toHaveTextContent(/Goals achieved1 \/ 2/);
    expect(field()).toHaveValue('');
    expect(writer().getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(await screen.findByText(/No retrospectives yet/)).toBeInTheDocument();
  });

  test('writing saves the whole week once, and saving again edits it', async () => {
    const api = await open();
    await expectHeading('Oct 18 – Oct 24, 2026 Weekly retrospective');
    type('행렬을 끝냈다.\n- 다음 주: 고유값');
    submit();
    expect(await writer().findByText(/Last saved 2026-10-23 21:00/)).toBeInTheDocument();
    expect(api.writes).toEqual([
      {
        method: 'PUT',
        path: '/api/retrospectives/weekly/2026-10-18',
        body: { body: '행렬을 끝냈다.\n- 다음 주: 고유값' },
      },
    ]);
    expect(writerEl()).toHaveTextContent(/Saved/);
    expect(writer().getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(await screen.findByText(/Weekly · Oct 18 – Oct 24, 2026/)).toBeInTheDocument();
    type('고쳐 쓴 회고');
    submit();
    await waitFor(() => expect(api.rows[0].body).toBe('고쳐 쓴 회고'));
    expect(api.rows).toHaveLength(1);
  });

  test('weeks and months move, and an unsaved draft waits for its period', async () => {
    const api = await open();
    await expectHeading('Oct 18 – Oct 24, 2026 Weekly retrospective');
    type('쓰다 만 회고');
    await move('Previous week', 'Oct 11 – Oct 17, 2026 Weekly retrospective');
    expect(api.periods.at(-1)).toBe('weekly:2026-10-11');
    expect(field()).toHaveValue('');
    await move('This week', 'Oct 18 – Oct 24, 2026 Weekly retrospective');
    expect(field()).toHaveValue('쓰다 만 회고');
    await move('Monthly', 'October 2026 Monthly retrospective');
    // The week's Wednesday picks the month (#19 review).
    expect(api.periods.at(-1)).toBe('monthly:2026-10-21');
    await move('Next month', 'November 2026 Monthly retrospective');
  });

  test('deleting needs a confirmation and focus follows the flow', async () => {
    const focused = recordFocus();
    const api = await open([
      {
        id: 1,
        kind: 'weekly',
        from: '2026-10-18',
        to: '2026-10-24',
        body: '이번 주 회고',
        updatedAt: '2026-10-22 22:00',
      },
    ]);
    await waitFor(() => expect(field()).toHaveValue('이번 주 회고'));
    const lastFocus = (id: string) => waitFor(() => expect(focused.at(-1)).toBe(id));
    fireEvent.click(writer().getByRole('button', { name: 'Delete' }));
    await lastFocus('retro-delete-confirm');
    fireEvent.click(writer().getByRole('button', { name: 'Cancel' }));
    await lastFocus('retro-delete');
    expect(api.writes).toHaveLength(0);
    fireEvent.click(writer().getByRole('button', { name: 'Delete' }));
    fireEvent.click(await writer().findByRole('button', { name: 'Confirm delete' }));
    await lastFocus('retro-heading');
    expect(api.writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'DELETE /api/retrospectives/weekly/2026-10-18',
    ]);
    expect(writerEl()).toHaveTextContent(/Deleted/);
    await waitFor(() => expect(field()).toHaveValue(''));
  });

  test('a past retrospective opens from the list', async () => {
    const api = await open([
      {
        id: 7,
        kind: 'monthly',
        from: '2026-09-01',
        to: '2026-09-30',
        body: '9월에는 미적분을 끝냈다',
        updatedAt: '2026-09-30 22:00',
      },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Monthly · September 2026' }));
    await expectHeading('September 2026 Monthly retrospective');
    expect(api.periods.at(-1)).toBe('monthly:2026-09-01');
    expect(field()).toHaveValue('9월에는 미적분을 끝냈다');
  });

  test('a failed load is reported instead of an empty form', async () => {
    await open([], { failPeriod: true });
    expect(
      await writer().findByText(/Could not load the retrospective: Server error/),
    ).toBeInTheDocument();
    expect(field()).toBeNull();
  });

  test('period helpers: moving and titles', () => {
    expect(shiftPeriod('weekly', '2026-12-27', 1)).toBe('2027-01-03');
    expect(shiftPeriod('monthly', '2026-01-01', -1)).toBe('2025-12-01');
    expect(periodTitle('weekly', '2026-12-27', '2027-01-02')).toBe('Dec 27, 2026 – Jan 2, 2027');
    expect(periodTitle('monthly', '2026-03-01', '2026-03-31')).toBe('March 2026');
  });

  test('a save shows the saved text at once, even when the reload fails', async () => {
    await open([], { failReload: true });
    await expectHeading('Oct 18 – Oct 24, 2026 Weekly retrospective');
    type('새로 쓴 회고');
    submit();
    // The period reload after the save failed: the error shows above the form, and the form
    // keeps the saved text.
    expect(await writer().findByText(/Could not load the retrospective/)).toBeInTheDocument();
    expect(field()).toHaveValue('새로 쓴 회고');
    expect(writer().getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  test('switching to monthly opens the month most of the week falls in', async () => {
    const api = await open();
    await expectHeading('Oct 18 – Oct 24, 2026 Weekly retrospective');
    // Forward to the week of Sunday 2026-11-29 to Saturday 12-05: five of its days are in December.
    const weeks = [
      'Oct 25 – Oct 31, 2026',
      'Nov 1 – Nov 7, 2026',
      'Nov 8 – Nov 14, 2026',
      'Nov 15 – Nov 21, 2026',
      'Nov 22 – Nov 28, 2026',
      'Nov 29 – Dec 5, 2026',
    ];
    for (const week of weeks) await move('Next week', `${week} Weekly retrospective`);
    await move('Monthly', 'December 2026 Monthly retrospective');
    expect(api.periods.at(-1)).toBe('monthly:2026-12-02');
    // From this month back to weekly, the week of today.
    await move('This month', 'October 2026 Monthly retrospective');
    await move('Weekly', 'Oct 18 – Oct 24, 2026 Weekly retrospective');
  });

  test("the retrospective shows the period's study pattern", async () => {
    const byHour = Array(24).fill(0);
    byHour[20] = 30;
    byHour[21] = 105;
    byHour[0] = 60;
    const api = await open([], {
      pattern: {
        totalMinutes: 195,
        byHour,
        byWeekday: [90, 0, 0, 105, 0, 0, 0],
        topHour: 21,
        topWeekday: 3,
      },
    });
    expect(
      await within(await screen.findByRole('region', { name: 'Study pattern' })).findByText(
        /You study most at/,
      ),
    ).toBeInTheDocument();
    expect(api.patterns).toEqual(['2026-10-18~2026-10-24']);
    expect(patternEl()).toHaveTextContent(
      /You study most at 21:00–22:00 \(1 h 45 min\), and on Wed \(1 h 45 min\)/,
    );
    // Weekday bars from Sunday, widths relative to the busiest day.
    const bars = Array.from(patternEl().querySelectorAll<HTMLElement>('.pattern-bar'));
    expect(bars.map((n) => n.style.width)).toEqual(['86%', '0%', '0%', '100%', '0%', '0%', '0%']);
    const hours = Array.from(
      patternEl().querySelectorAll<HTMLElement>('.pattern-hour, .pattern-hour.top'),
    );
    expect(hours).toHaveLength(24);
    expect(hours[21].className).toBe('pattern-hour top');
    expect(hours[0].title).toBe('00:00–01:00: 1 h');
    // Moving to another week asks for its pattern.
    await move('Previous week', 'Oct 11 – Oct 17, 2026 Weekly retrospective');
    await waitFor(() => expect(api.patterns.at(-1)).toBe('2026-10-11~2026-10-17'));
  });

  test('a period without study or a failed pattern says so', async () => {
    await open();
    expect(
      await within(await screen.findByRole('region', { name: 'Study pattern' })).findByText(
        /There are no study logs in this period, so there is no pattern to show/,
      ),
    ).toBeInTheDocument();
    cleanup();
    await open([], { pattern: null });
    expect(
      await within(await screen.findByRole('region', { name: 'Study pattern' })).findByText(
        /Could not load the study pattern: Server error/,
      ),
    ).toBeInTheDocument();
  });

  test('pattern helpers: hour labels and bar widths', () => {
    expect(hourLabel(23)).toBe('23:00–00:00');
    expect(hourLabel(0)).toBe('00:00–01:00');
    expect(barWidth(30, [0, 30, 60])).toBe('50%');
    expect(barWidth(0, [0, 0])).toBe('0%');
  });
});
