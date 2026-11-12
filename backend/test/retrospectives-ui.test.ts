import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type FetchInit, frontendMissing, loadFrontendModule, mount } from './ui-harness.js';

const uiTest = frontendMissing ? test.skip : test;

const today = '2026-10-23'; // a Friday; its week is Sunday 10-18 to Saturday 10-24

type Retro = {
  id: number;
  kind: string;
  from: string;
  to: string;
  body: string;
  updatedAt: string;
};

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const periodOf = (kind: string, date: string) => {
  if (kind === 'weekly') {
    const from = addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
    return { from, to: addDays(from, 6) };
  }
  const [year, month] = date.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${date.slice(0, 7)}-01`, to: `${date.slice(0, 7)}-${last}` };
};

// The retrospective API in memory; records period requests and writes.
function fakeApi(
  initial: Retro[] = [],
  options: {
    failPeriod?: boolean;
    failReload?: boolean;
    // The pattern answered for every period; undefined answers a 500.
    pattern?: Record<string, unknown> | null;
  } = {},
) {
  const rows = initial.map((row) => ({ ...row }));
  const periods: string[] = [];
  const patterns: string[] = [];
  const writes: { method: string; path: string; body?: unknown }[] = [];
  let nextId = 100;
  const reply = (status: number, body?: unknown) => ({
    ok: status < 400,
    status,
    json: async () => body,
  });
  const fetch = async (path: string, init: FetchInit = {}) => {
    const method = init.method ?? 'GET';
    if (path === '/api/health') return reply(200, { ok: true, today });
    if (path.startsWith('/api/study-logs')) return reply(200, { studyLogs: [] });
    if (path === '/api/textbooks') return reply(200, { textbooks: [] });
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
    assert.ok(one, 'unexpected request ' + path);
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
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
  return { fetch, periods, writes, rows, patterns };
}

const emptyPattern = {
  totalMinutes: 0,
  byHour: Array(24).fill(0),
  byWeekday: Array(7).fill(0),
  topHour: null,
  topWeekday: null,
};

type Ui = ReturnType<typeof mount>;
const writer = (ui: Ui) => ui.find((n) => n.props['aria-label'] === 'Write a retrospective')[0];
const heading = (ui: Ui) => ui.text(ui.find((n) => n.type === 'h2', writer(ui))[0]);
const field = (ui: Ui) => ui.find((n) => n.type === 'textarea', writer(ui))[0];
const type = async (ui: Ui, value: string) => {
  (field(ui).props.onChange as (e: { target: { value: string } }) => void)({ target: { value } });
  await ui.settle();
};

async function open(api: ReturnType<typeof fakeApi>, globals: Record<string, unknown> = {}) {
  const ui = mount(api.fetch, globals);
  await ui.settle();
  await ui.click('Retrospective');
  return ui;
}

uiTest("the page opens on this week's retrospective with the week's study summary", async () => {
  const api = fakeApi();
  const ui = await open(api);
  assert.deepEqual(api.periods, [`weekly:${today}`]);
  assert.equal(heading(ui), 'Oct 18 – Oct 24, 2026 Weekly retrospective');
  const summary = ui.find((n) => n.props.className === 'retro-summary', writer(ui))[0];
  assert.match(ui.text(summary), /Study time4 h 30 min/);
  assert.match(ui.text(summary), /Study days2/);
  assert.match(ui.text(summary), /Study logs3/);
  assert.match(ui.text(summary), /Goals achieved1 \/ 2/);
  assert.equal(field(ui).props.value, '');
  assert.match(ui.text(writer(ui)), /Save/);
  assert.match(ui.text(), /No retrospectives yet/);
});

uiTest('writing saves the whole week once, and saving again edits it', async () => {
  const api = fakeApi();
  const ui = await open(api);
  await type(ui, '행렬을 끝냈다.\n- 다음 주: 고유값');
  await ui.submit(writer(ui));
  assert.deepEqual(api.writes, [
    {
      method: 'PUT',
      path: '/api/retrospectives/weekly/2026-10-18',
      body: { body: '행렬을 끝냈다.\n- 다음 주: 고유값' },
    },
  ]);
  assert.match(ui.text(writer(ui)), /Saved/);
  assert.match(ui.text(writer(ui)), /Save changes/);
  assert.match(ui.text(writer(ui)), /Last saved 2026-10-23 21:00/);
  assert.match(ui.text(), /Weekly · Oct 18 – Oct 24, 2026/);
  await type(ui, '고쳐 쓴 회고');
  await ui.submit(writer(ui));
  assert.equal(api.rows.length, 1);
  assert.equal(api.rows[0].body, '고쳐 쓴 회고');
});

uiTest('weeks and months move, and an unsaved draft waits for its period', async () => {
  const api = fakeApi();
  const ui = await open(api);
  await type(ui, '쓰다 만 회고');
  await ui.click('Previous', writer(ui));
  assert.equal(api.periods.at(-1), 'weekly:2026-10-11');
  assert.equal(heading(ui), 'Oct 11 – Oct 17, 2026 Weekly retrospective');
  assert.equal(field(ui).props.value, '');
  await ui.click('This week', writer(ui));
  assert.equal(field(ui).props.value, '쓰다 만 회고');
  await ui.click('Monthly', writer(ui));
  // The week's Wednesday picks the month (#19 review).
  assert.equal(api.periods.at(-1), 'monthly:2026-10-21');
  assert.equal(heading(ui), 'October 2026 Monthly retrospective');
  await ui.click('Next', writer(ui));
  assert.equal(heading(ui), 'November 2026 Monthly retrospective');
});

uiTest('deleting needs a confirmation and focus follows the flow', async () => {
  const focused: string[] = [];
  const document = { getElementById: (id: string) => ({ focus: () => focused.push(id) }) };
  const api = fakeApi([
    {
      id: 1,
      kind: 'weekly',
      from: '2026-10-18',
      to: '2026-10-24',
      body: '이번 주 회고',
      updatedAt: '2026-10-22 22:00',
    },
  ]);
  const ui = await open(api, { document });
  assert.equal(field(ui).props.value, '이번 주 회고');
  await ui.click('Delete', writer(ui));
  assert.equal(focused.at(-1), 'retro-delete-confirm');
  await ui.click('Cancel', writer(ui));
  assert.equal(focused.at(-1), 'retro-delete');
  assert.equal(api.writes.length, 0);
  await ui.click('Delete', writer(ui));
  await ui.click('Confirm delete', writer(ui));
  assert.deepEqual(
    api.writes.map((w) => `${w.method} ${w.path}`),
    ['DELETE /api/retrospectives/weekly/2026-10-18'],
  );
  assert.equal(focused.at(-1), 'retro-heading');
  assert.match(ui.text(writer(ui)), /Deleted/);
  assert.equal(field(ui).props.value, '');
});

uiTest('a past retrospective opens from the list', async () => {
  const api = fakeApi([
    {
      id: 7,
      kind: 'monthly',
      from: '2026-09-01',
      to: '2026-09-30',
      body: '9월에는 미적분을 끝냈다',
      updatedAt: '2026-09-30 22:00',
    },
  ]);
  const ui = await open(api);
  await ui.click('Monthly · September 2026');
  assert.equal(api.periods.at(-1), 'monthly:2026-09-01');
  assert.equal(heading(ui), 'September 2026 Monthly retrospective');
  assert.equal(field(ui).props.value, '9월에는 미적분을 끝냈다');
});

uiTest('a failed load is reported instead of an empty form', async () => {
  const ui = await open(fakeApi([], { failPeriod: true }));
  assert.match(ui.text(writer(ui)), /Could not load the retrospective: Server error/);
  assert.equal(field(ui), undefined);
});

uiTest('period helpers: moving and titles', () => {
  const retro = loadFrontendModule<{
    shiftPeriod(kind: string, from: string, delta: number): string;
    periodTitle(kind: string, from: string, to: string): string;
  }>('retrospective.ts');
  assert.equal(retro.shiftPeriod('weekly', '2026-12-27', 1), '2027-01-03');
  assert.equal(retro.shiftPeriod('monthly', '2026-01-01', -1), '2025-12-01');
  assert.equal(
    retro.periodTitle('weekly', '2026-12-27', '2027-01-02'),
    'Dec 27, 2026 – Jan 2, 2027',
  );
  assert.equal(retro.periodTitle('monthly', '2026-03-01', '2026-03-31'), 'March 2026');
});

uiTest('a save shows the saved text at once, even when the reload fails', async () => {
  const api = fakeApi([], { failReload: true });
  const ui = await open(api);
  await type(ui, '새로 쓴 회고');
  await ui.submit(writer(ui));
  // The period reload after the save failed: the error shows above the form, and the form
  // keeps the saved text.
  assert.match(ui.text(writer(ui)), /Could not load the retrospective/);
  assert.equal(field(ui).props.value, '새로 쓴 회고');
  assert.match(ui.text(writer(ui)), /Save changes/);
});

uiTest('switching to monthly opens the month most of the week falls in', async () => {
  const api = fakeApi();
  const ui = await open(api);
  // Back to the week of Sunday 2026-11-29 to Saturday 12-05: five of its days are in December.
  for (const _ of [1, 2, 3, 4, 5, 6]) await ui.click('Next', writer(ui));
  assert.equal(heading(ui), 'Nov 29 – Dec 5, 2026 Weekly retrospective');
  await ui.click('Monthly', writer(ui));
  assert.equal(api.periods.at(-1), 'monthly:2026-12-02');
  assert.equal(heading(ui), 'December 2026 Monthly retrospective');
  // From this month back to weekly, the week of today.
  await ui.click('This month', writer(ui));
  await ui.click('Weekly', writer(ui));
  assert.equal(heading(ui), 'Oct 18 – Oct 24, 2026 Weekly retrospective');
});

const pattern = (ui: Ui) =>
  ui.find((n) => n.props['aria-label'] === 'Study pattern', writer(ui))[0];

uiTest("the retrospective shows the period's study pattern", async () => {
  const byHour = Array(24).fill(0);
  byHour[20] = 30;
  byHour[21] = 105;
  byHour[0] = 60;
  const api = fakeApi([], {
    pattern: {
      totalMinutes: 195,
      byHour,
      byWeekday: [90, 0, 0, 105, 0, 0, 0],
      topHour: 21,
      topWeekday: 3,
    },
  });
  const ui = await open(api);
  assert.deepEqual(api.patterns, ['2026-10-18~2026-10-24']);
  assert.match(
    ui.text(pattern(ui)),
    /You study most at 21:00–22:00 \(1 h 45 min\), and on Wed \(1 h 45 min\)/,
  );
  // Weekday bars from Sunday, widths relative to the busiest day.
  const bars = ui.find((n) => n.props.className === 'pattern-bar', pattern(ui));
  assert.deepEqual(
    bars.map((n) => (n.props.style as { width: string }).width),
    ['86%', '0%', '0%', '100%', '0%', '0%', '0%'],
  );
  const hours = ui.find(
    (n) => n.props.className === 'pattern-hour' || n.props.className === 'pattern-hour top',
    pattern(ui),
  );
  assert.equal(hours.length, 24);
  assert.equal(hours[21].props.className, 'pattern-hour top');
  assert.equal(hours[0].props.title, '00:00–01:00: 1 h');
  // Moving to another week asks for its pattern.
  await ui.click('Previous', writer(ui));
  assert.equal(api.patterns.at(-1), '2026-10-11~2026-10-17');
});

uiTest('a period without study or a failed pattern says so', async () => {
  const quiet = await open(fakeApi());
  assert.match(
    ui2text(quiet),
    /There are no study logs in this period, so there is no pattern to show/,
  );
  const failing = await open(fakeApi([], { pattern: null }));
  assert.match(ui2text(failing), /Could not load the study pattern: Server error/);
});

const ui2text = (ui: Ui) => ui.text(pattern(ui));

uiTest('pattern helpers: hour labels and bar widths', () => {
  const stats = loadFrontendModule<{
    hourLabel(hour: number): string;
    barWidth(value: number, values: number[]): string;
  }>('study-stats.ts');
  assert.equal(stats.hourLabel(23), '23:00–00:00');
  assert.equal(stats.hourLabel(0), '00:00–01:00');
  assert.equal(stats.barWidth(30, [0, 30, 60]), '50%');
  assert.equal(stats.barWidth(0, [0, 0]), '0%');
});
