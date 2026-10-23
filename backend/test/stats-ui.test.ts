import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendMissing, mount, type FetchInit } from './ui-harness.js';

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
