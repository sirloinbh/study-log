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
        ? reply(500, { error: '서버 오류가 발생했습니다' })
        : reply(200, { from: pattern[1], to: pattern[2], ...(options.pattern ?? emptyPattern) });
    }
    const period = path.match(/^\/api\/retrospectives\/period\?kind=(\w+)&date=(.+)$/);
    if (period) {
      periods.push(`${period[1]}:${period[2]}`);
      if (options.failPeriod) return reply(500, { error: '서버 오류가 발생했습니다' });
      if (options.failReload && periods.length > 1)
        return reply(500, { error: '서버 오류가 발생했습니다' });
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
      if (index < 0) return reply(404, { error: '회고를 찾을 수 없습니다' });
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
const writer = (ui: Ui) => ui.find((n) => n.props['aria-label'] === '회고 작성')[0];
const heading = (ui: Ui) => ui.text(ui.find((n) => n.type === 'h2', writer(ui))[0]);
const field = (ui: Ui) => ui.find((n) => n.type === 'textarea', writer(ui))[0];
const type = async (ui: Ui, value: string) => {
  (field(ui).props.onChange as (e: { target: { value: string } }) => void)({ target: { value } });
  await ui.settle();
};

async function open(api: ReturnType<typeof fakeApi>, globals: Record<string, unknown> = {}) {
  const ui = mount(api.fetch, globals);
  await ui.settle();
  await ui.click('회고');
  return ui;
}

uiTest("the page opens on this week's retrospective with the week's study summary", async () => {
  const api = fakeApi();
  const ui = await open(api);
  assert.deepEqual(api.periods, [`weekly:${today}`]);
  assert.equal(heading(ui), '2026년 10월 18일 ~ 10월 24일 주간 회고');
  const summary = ui.find((n) => n.props.className === 'retro-summary', writer(ui))[0];
  assert.match(ui.text(summary), /학습 시간4시간 30분/);
  assert.match(ui.text(summary), /공부한 날2일/);
  assert.match(ui.text(summary), /학습 기록3개/);
  assert.match(ui.text(summary), /목표 달성1 \/ 2/);
  assert.equal(field(ui).props.value, '');
  assert.match(ui.text(writer(ui)), /저장/);
  assert.match(ui.text(), /아직 쓴 회고가 없습니다/);
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
  assert.match(ui.text(writer(ui)), /저장했습니다/);
  assert.match(ui.text(writer(ui)), /수정 저장/);
  assert.match(ui.text(writer(ui)), /마지막 저장 2026-10-23 21:00/);
  assert.match(ui.text(), /주간 · 2026년 10월 18일 ~ 10월 24일/);
  await type(ui, '고쳐 쓴 회고');
  await ui.submit(writer(ui));
  assert.equal(api.rows.length, 1);
  assert.equal(api.rows[0].body, '고쳐 쓴 회고');
});

uiTest('weeks and months move, and an unsaved draft waits for its period', async () => {
  const api = fakeApi();
  const ui = await open(api);
  await type(ui, '쓰다 만 회고');
  await ui.click('이전', writer(ui));
  assert.equal(api.periods.at(-1), 'weekly:2026-10-11');
  assert.equal(heading(ui), '2026년 10월 11일 ~ 10월 17일 주간 회고');
  assert.equal(field(ui).props.value, '');
  await ui.click('이번 주', writer(ui));
  assert.equal(field(ui).props.value, '쓰다 만 회고');
  await ui.click('월간', writer(ui));
  // The week's Wednesday picks the month (#19 review).
  assert.equal(api.periods.at(-1), 'monthly:2026-10-21');
  assert.equal(heading(ui), '2026년 10월 월간 회고');
  await ui.click('다음', writer(ui));
  assert.equal(heading(ui), '2026년 11월 월간 회고');
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
  await ui.click('삭제', writer(ui));
  assert.equal(focused.at(-1), 'retro-delete-confirm');
  await ui.click('취소', writer(ui));
  assert.equal(focused.at(-1), 'retro-delete');
  assert.equal(api.writes.length, 0);
  await ui.click('삭제', writer(ui));
  await ui.click('삭제 확인', writer(ui));
  assert.deepEqual(
    api.writes.map((w) => `${w.method} ${w.path}`),
    ['DELETE /api/retrospectives/weekly/2026-10-18'],
  );
  assert.equal(focused.at(-1), 'retro-heading');
  assert.match(ui.text(writer(ui)), /삭제했습니다/);
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
  await ui.click('월간 · 2026년 9월');
  assert.equal(api.periods.at(-1), 'monthly:2026-09-01');
  assert.equal(heading(ui), '2026년 9월 월간 회고');
  assert.equal(field(ui).props.value, '9월에는 미적분을 끝냈다');
});

uiTest('a failed load is reported instead of an empty form', async () => {
  const ui = await open(fakeApi([], { failPeriod: true }));
  assert.match(ui.text(writer(ui)), /회고를 불러오지 못했습니다: 서버 오류가 발생했습니다/);
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
    '2026년 12월 27일 ~ 2027년 1월 2일',
  );
  assert.equal(retro.periodTitle('monthly', '2026-03-01', '2026-03-31'), '2026년 3월');
});

uiTest('a save shows the saved text at once, even when the reload fails', async () => {
  const api = fakeApi([], { failReload: true });
  const ui = await open(api);
  await type(ui, '새로 쓴 회고');
  await ui.submit(writer(ui));
  // The period reload after the save failed: the error shows above the form, and the form
  // keeps the saved text.
  assert.match(ui.text(writer(ui)), /회고를 불러오지 못했습니다/);
  assert.equal(field(ui).props.value, '새로 쓴 회고');
  assert.match(ui.text(writer(ui)), /수정 저장/);
});

uiTest('switching to monthly opens the month most of the week falls in', async () => {
  const api = fakeApi();
  const ui = await open(api);
  // Back to the week of Sunday 2026-11-29 to Saturday 12-05: five of its days are in December.
  for (const _ of [1, 2, 3, 4, 5, 6]) await ui.click('다음', writer(ui));
  assert.equal(heading(ui), '2026년 11월 29일 ~ 12월 5일 주간 회고');
  await ui.click('월간', writer(ui));
  assert.equal(api.periods.at(-1), 'monthly:2026-12-02');
  assert.equal(heading(ui), '2026년 12월 월간 회고');
  // From this month back to weekly, the week of today.
  await ui.click('이번 달', writer(ui));
  await ui.click('주간', writer(ui));
  assert.equal(heading(ui), '2026년 10월 18일 ~ 10월 24일 주간 회고');
});

const pattern = (ui: Ui) => ui.find((n) => n.props['aria-label'] === '학습 패턴', writer(ui))[0];

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
    /가장 많이 공부한 시간대는 21시~22시\(1시간 45분\), 요일은 수요일\(1시간 45분\)입니다/,
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
  assert.equal(hours[0].props.title, '0시~1시: 1시간');
  // Moving to another week asks for its pattern.
  await ui.click('이전', writer(ui));
  assert.equal(api.patterns.at(-1), '2026-10-11~2026-10-17');
});

uiTest('a period without study or a failed pattern says so', async () => {
  const quiet = await open(fakeApi());
  assert.match(ui2text(quiet), /학습 기록이 없어 패턴을 볼 수 없습니다/);
  const failing = await open(fakeApi([], { pattern: null }));
  assert.match(ui2text(failing), /학습 패턴을 불러오지 못했습니다: 서버 오류가 발생했습니다/);
});

const ui2text = (ui: Ui) => ui.text(pattern(ui));

uiTest('pattern helpers: hour labels and bar widths', () => {
  const stats = loadFrontendModule<{
    hourLabel(hour: number): string;
    barWidth(value: number, values: number[]): string;
  }>('study-stats.ts');
  assert.equal(stats.hourLabel(23), '23시~0시');
  assert.equal(stats.hourLabel(0), '0시~1시');
  assert.equal(stats.barWidth(30, [0, 30, 60]), '50%');
  assert.equal(stats.barWidth(0, [0, 0]), '0%');
});
