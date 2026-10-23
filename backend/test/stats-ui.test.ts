import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendMissing, loadFrontendModule, mount, type FetchInit } from './ui-harness.js';

const uiTest = frontendMissing ? test.skip : test;

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
  daily: [],
  weekly: [],
  monthly: [],
});

type Options = {
  // Answers per period; a missing one is a 500.
  totals?: Record<string, number>;
  // Requests for these periods wait for the promise.
  hold?: { periods: string[]; until: Promise<void> };
  // The heatmap's days, from a Sunday; undefined answers a 500.
  heatmap?: { from: string; to: string; daily: { date: string; minutes: number }[] } | null;
};

// The stats API; records the periods asked for.
function fakeApi(options: Options = {}) {
  const totals = options.totals ?? { week: 285, month: 485, '3months': 665, all: 665 };
  const asked: string[] = [];
  const reply = (status: number, body: unknown) => ({
    ok: status < 400,
    status,
    json: async () => body,
  });
  const fetch = async (path: string, _init: FetchInit = {}) => {
    if (path === '/api/health') return reply(200, { ok: true, today: '2026-10-23' });
    if (path.startsWith('/api/study-logs')) return reply(200, { studyLogs: [] });
    if (path === '/api/textbooks') return reply(200, { textbooks: [] });
    if (path === '/api/stats/heatmap')
      return options.heatmap === null
        ? reply(500, { error: '서버 오류가 발생했습니다' })
        : reply(200, options.heatmap ?? { from: '2026-10-19', to: '2026-10-19', daily: [] });
    const match = path.match(/^\/api\/stats\/study-time\?period=(.+)$/);
    assert.ok(match, 'unexpected request ' + path);
    const period = match[1];
    asked.push(period);
    if (options.hold?.periods.includes(period)) await options.hold.until;
    return period in totals
      ? reply(200, statsFor(period, totals[period]))
      : reply(500, { error: '서버 오류가 발생했습니다' });
  };
  return { fetch, asked };
}

type Ui = ReturnType<typeof mount>;
// Each card as "title:value".
const cards = (ui: Ui) =>
  ui
    .find((n) => typeof n.props.className === 'string' && n.props.className === 'card metric')
    .map(
      (card) =>
        ui.text(ui.find((n) => n.type === 'h2', card)[0]) +
        ':' +
        ui.text(ui.find((n) => n.props.className === 'metric-value', card)[0]),
    );
const pressed = (ui: Ui) =>
  ui.find((n) => n.type === 'button' && n.props['aria-pressed'] === true).map((n) => ui.text(n));

async function openStats(api: ReturnType<typeof fakeApi>) {
  const ui = mount(api.fetch);
  await ui.settle();
  await ui.click('통계');
  return ui;
}

uiTest('the dashboard opens on this week with the four metric cards', async () => {
  const api = fakeApi();
  const ui = await openStats(api);
  assert.deepEqual(api.asked, ['week']);
  assert.deepEqual(pressed(ui), ['이번 주']);
  assert.deepEqual(cards(ui), [
    '총 학습 시간:11시간 5분',
    '오늘:1시간 30분',
    '이번 주:4시간 45분',
    '하루 평균:57분',
  ]);
  assert.match(ui.text(), /2026-10-19 ~ 2026-10-23/);
  assert.match(ui.text(), /5일 중 3일 공부/);
  assert.match(ui.text(), /공부한 날만 1시간 35분/);
  // The cards hold more than the period (the all-time total), so their group is named neutrally.
  assert.equal(
    ui.find((n) => n.props.className === 'metric-grid')[0].props['aria-label'],
    '학습 시간 지표',
  );
});

uiTest('picking a period asks for it and relabels the period card', async () => {
  const api = fakeApi();
  const ui = await openStats(api);
  await ui.click('이번 달');
  assert.deepEqual(api.asked, ['week', 'month']);
  assert.deepEqual(pressed(ui), ['이번 달']);
  assert.deepEqual(cards(ui), [
    '총 학습 시간:11시간 5분',
    '오늘:1시간 30분',
    '이번 달:8시간 5분',
    '하루 평균:21분',
  ]);
  assert.match(ui.text(), /이번 달 기준/);
  for (const [label, period] of [
    ['최근 3개월', '3months'],
    ['전체', 'all'],
  ]) {
    await ui.click(label);
    assert.equal(api.asked.at(-1), period);
  }
});

uiTest("a slow answer for the previous period is not shown as the new one's", async () => {
  let release = () => {};
  const api = fakeApi({ hold: { periods: ['week'], until: new Promise((r) => (release = r)) } });
  const ui = await openStats(api);
  // Announced while waiting, so the change to the cards is not silent.
  assert.match(ui.text(ui.find((n) => n.props.role === 'status').at(-1)), /불러오는 중/);
  await ui.click('이번 달');
  release();
  await ui.settle();
  assert.deepEqual(pressed(ui), ['이번 달']);
  assert.equal(cards(ui)[2], '이번 달:8시간 5분');
});

uiTest('a failed load is reported instead of empty cards', async () => {
  const api = fakeApi({ totals: { week: 285 } });
  const ui = await openStats(api);
  await ui.click('이번 달');
  assert.match(
    ui.text(ui.find((n) => n.props.role === 'alert')),
    /통계를 불러오지 못했습니다: 서버 오류가 발생했습니다/,
  );
  assert.deepEqual(cards(ui), []);
  assert.doesNotMatch(ui.text(), /불러오는 중/);
  // Going back to a period that loads shows its cards again.
  await ui.click('이번 주');
  assert.equal(cards(ui).length, 4);
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

uiTest('the heatmap shows each day in its band with a tooltip, by week columns', async () => {
  const ui = await openStats(fakeApi({ heatmap: twoWeeks }));
  const weeks = ui.find((n) => n.props.className === 'heat-week');
  assert.equal(weeks.length, 2);
  const cells = (week: (typeof weeks)[number]) =>
    ui
      .find(
        (n) => typeof n.props.className === 'string' && n.props.className.startsWith('heat-cell'),
        week,
      )
      .map((n) => String(n.props.className).replace('heat-cell ', ''));
  assert.deepEqual(cells(weeks[0]), [
    'level-0',
    'level-1',
    'level-2',
    'level-2',
    'level-3',
    'level-3',
    'level-4',
  ]);
  // Sunday to Tuesday, then the rest of this week is empty.
  assert.deepEqual(cells(weeks[1]), [
    'level-0',
    'level-0',
    'level-2',
    'future',
    'future',
    'future',
    'future',
  ]);
  const [ninetyNine] = ui.find((n) => n.props.title === '2026-10-09: 1시간 59분');
  assert.ok(ninetyNine, 'tooltip of 2026-10-09');
  // One summary for screen readers.
  const [image] = ui.find((n) => n.props.role === 'img');
  assert.equal(image.props['aria-label'], '2026-10-04부터 2026-10-13까지 7일 공부, 총 7시간 23분');
  assert.match(ui.text(), /7일 공부 · 총 7시간 23분/);
  assert.deepEqual(
    ui
      .find((n) => n.props.className === 'heat-legend')
      .flatMap((list) => ui.find((n) => n.type === 'li', list).map((n) => ui.text(n))),
    ['0분', '30분 미만', '30분~1시간', '1~2시간', '2시간 이상'],
  );
});

uiTest('a failed heatmap load is reported and the metric cards stay', async () => {
  const ui = await openStats(fakeApi({ heatmap: null }));
  assert.match(ui.text(), /히트맵을 불러오지 못했습니다: 서버 오류가 발생했습니다/);
  assert.equal(cards(ui).length, 4);
});

uiTest('heatmap levels, weeks and month labels', () => {
  const logic = loadFrontendModule<{
    heatLevel(minutes: number): number;
    heatWeeks(daily: { date: string; minutes: number }[]): unknown[][];
    monthLabel(week: ({ date: string; minutes: number } | null)[]): string;
  }>('study-stats.ts');
  assert.deepEqual(
    [0, 1, 29, 30, 59, 60, 119, 120, 600].map(logic.heatLevel),
    [0, 1, 1, 2, 2, 3, 3, 4, 4],
  );
  const days = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      date: `2026-09-${String(from + i).padStart(2, '0')}`,
      minutes: 0,
    }));
  const weeks = logic.heatWeeks(days(21, 9));
  assert.deepEqual(
    Array.from(weeks, (week) => Array.from(week, (day) => day !== null).filter(Boolean).length),
    [7, 2],
  );
  assert.equal(
    logic.monthLabel([
      { date: '2026-09-28', minutes: 0 },
      { date: '2026-10-01', minutes: 0 },
    ]),
    '10월',
  );
  assert.equal(logic.monthLabel([{ date: '2026-09-21', minutes: 0 }, null]), '');
});
