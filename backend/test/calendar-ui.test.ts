import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendMissing, loadFrontendModule, mount, type FetchInit } from './ui-harness.js';

const uiTest = frontendMissing ? test.skip : test;

const today = '2026-10-22';

type Log = {
  id: number;
  studyDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  memo: string;
  status: string;
};

const log = (id: number, studyDate: string, minutes: number, status = 'done'): Log => ({
  id,
  studyDate,
  startTime: '09:00',
  endTime: '10:00',
  durationMinutes: minutes,
  memo: `메모 ${id}`,
  status,
});

// The study log API with the calendar; records calendar and day requests.
function fakeApi(initial: Log[], options: { failCalendar?: boolean } = {}) {
  const logs = [...initial];
  const calendar: string[] = [];
  const reply = (status: number, body: unknown) => ({
    ok: status < 400,
    status,
    json: async () => body,
  });
  const fetch = async (path: string, init: FetchInit = {}) => {
    const method = init.method ?? 'GET';
    if (path === '/api/health') return reply(200, { ok: true, today });
    if (path === '/api/textbooks') return reply(200, { textbooks: [] });
    const month = path.match(/^\/api\/study-logs\/calendar\?month=(\d{4}-\d{2})$/);
    if (month) {
      calendar.push(path);
      if (options.failCalendar) return reply(500, { error: '서버 오류가 발생했습니다' });
      const [year, number] = month[1].split('-').map(Number);
      const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
      const days = Array.from({ length: last }, (_, i) => {
        const date = `${month[1]}-${String(i + 1).padStart(2, '0')}`;
        const ofDay = logs.filter((l) => l.studyDate === date);
        return {
          date,
          minutes: ofDay
            .filter((l) => l.status !== 'planned')
            .reduce((sum, l) => sum + l.durationMinutes, 0),
          logs: ofDay.length,
        };
      });
      return reply(200, { month: month[1], days });
    }
    const day = path.match(/^\/api\/study-logs\?date=(.+)$/);
    if (day) {
      calendar.push(path);
      return reply(200, { studyLogs: logs.filter((l) => l.studyDate === day[1]) });
    }
    if (path.startsWith('/api/study-logs?limit=')) return reply(200, { studyLogs: logs });
    if (path === '/api/study-logs' && method === 'POST') {
      const body = JSON.parse(init.body ?? '{}');
      const saved = log(100 + logs.length, body.studyDate, 60);
      logs.push(saved);
      return reply(201, { studyLog: saved });
    }
    throw new Error('unexpected request ' + method + ' ' + path);
  };
  return { fetch, calendar };
}

const logs = [
  log(1, '2026-10-01', 45),
  log(2, '2026-10-22', 90),
  log(3, '2026-10-22', 30, 'planned'),
  log(4, '2026-09-30', 120),
];

type Ui = ReturnType<typeof mount>;
const card = (ui: Ui) => ui.find((n) => n.props['aria-label'] === '학습 캘린더')[0];
const dayButton = (ui: Ui, date: string) =>
  ui.find(
    (n) =>
      n.type === 'button' &&
      typeof n.props['aria-label'] === 'string' &&
      n.props['aria-label'].startsWith(`${date},`),
    card(ui),
  )[0];

async function open(api: ReturnType<typeof fakeApi>) {
  const ui = mount(api.fetch);
  await ui.settle();
  return ui;
}

uiTest('the calendar shows this month from Monday with each day’s study time', async () => {
  const api = fakeApi(logs);
  const ui = await open(api);
  assert.match(ui.text(card(ui)), /2026년 10월/);
  // 2026-10-01 is a Thursday: three empty slots (Mon to Wed) before it.
  const grid = ui.find((n) => n.props.className === 'calendar-grid', card(ui))[0];
  const slots = (grid.props.children as unknown[])
    .flat()
    .filter((n): n is { type: string } => typeof n === 'object' && n !== null)
    .map((n) => n.type);
  // Seven weekday names, then three empty slots, then the 1st.
  assert.deepEqual(slots.slice(7, 11), ['span', 'span', 'span', 'button']);
  assert.equal(dayButton(ui, '2026-10-01').props['aria-label'], '2026-10-01, 학습 45분, 기록 1개');
  // The planned log counts as a log but not as time.
  const todayButton = dayButton(ui, today);
  assert.equal(todayButton.props['aria-label'], '2026-10-22, 학습 1시간 30분, 기록 2개');
  assert.match(ui.text(todayButton), /1\.5시간/);
  assert.match(String(todayButton.props.className), /today/);
  assert.equal(todayButton.props['aria-pressed'], true);
  assert.equal(dayButton(ui, '2026-10-02').props['aria-label'], '2026-10-02, 학습 없음, 기록 0개');
  // Today's logs are listed under the calendar.
  assert.match(ui.text(card(ui)), /2026-10-22 일지/);
  assert.match(ui.text(card(ui)), /메모 2/);
  assert.match(ui.text(card(ui)), /메모 3/);
});

uiTest('picking a day lists its logs; a day without any says so', async () => {
  const api = fakeApi(logs);
  const ui = await open(api);
  await ui.click('1', dayButton(ui, '2026-10-01'));
  assert.equal(dayButton(ui, '2026-10-01').props['aria-pressed'], true);
  assert.equal(api.calendar.at(-1), '/api/study-logs?date=2026-10-01');
  assert.match(ui.text(card(ui)), /2026-10-01 일지/);
  assert.match(ui.text(card(ui)), /메모 1/);
  await ui.click('2', dayButton(ui, '2026-10-02'));
  assert.match(ui.text(card(ui)), /이 날짜의 기록이 없습니다/);
});

uiTest('months move back and forth and 이번 달 returns to today', async () => {
  const api = fakeApi(logs);
  const ui = await open(api);
  await ui.click('이전', card(ui));
  assert.match(ui.text(card(ui)), /2026년 9월/);
  assert.equal(api.calendar.at(-1), '/api/study-logs/calendar?month=2026-09');
  assert.equal(dayButton(ui, '2026-09-30').props['aria-label'], '2026-09-30, 학습 2시간, 기록 1개');
  await ui.click('다음', card(ui));
  await ui.click('다음', card(ui));
  assert.match(ui.text(card(ui)), /2026년 11월/);
  await ui.click('이번 달', card(ui));
  assert.match(ui.text(card(ui)), /2026년 10월/);
  assert.equal(dayButton(ui, today).props['aria-pressed'], true);
});

uiTest('saving a log on the page reloads the calendar', async () => {
  const api = fakeApi(logs);
  const ui = await open(api);
  const before = api.calendar.length;
  await ui.fill('시작', '13:00');
  await ui.fill('종료', '14:00');
  await ui.submit();
  assert.deepEqual(api.calendar.slice(before), [
    '/api/study-logs/calendar?month=2026-10',
    '/api/study-logs?date=2026-10-22',
  ]);
  assert.equal(dayButton(ui, today).props['aria-label'], '2026-10-22, 학습 2시간 30분, 기록 3개');
});

uiTest('a failed calendar load is reported', async () => {
  const ui = await open(fakeApi(logs, { failCalendar: true }));
  assert.match(ui.text(card(ui)), /캘린더를 불러오지 못했습니다: 서버 오류가 발생했습니다/);
});

uiTest('calendar helpers: months, Monday-first slots and short amounts', () => {
  const calendar = loadFrontendModule<{
    shiftMonth(month: string, delta: number): string;
    monthTitle(month: string): string;
    calendarCells(days: { date: string }[]): unknown[];
    shortMinutes(minutes: number): string;
  }>('month-calendar.ts');
  assert.equal(calendar.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(calendar.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(calendar.monthTitle('2026-03'), '2026년 3월');
  // 2026-06-01 is a Monday (no empty slot); 2026-03-01 a Sunday (six).
  assert.equal(calendar.calendarCells([{ date: '2026-06-01' }])[0] !== null, true);
  assert.equal(
    calendar.calendarCells([{ date: '2026-03-01' }]).filter((cell) => cell === null).length,
    6,
  );
  assert.deepEqual([0, 45, 60, 90, 125].map(calendar.shortMinutes), [
    '',
    '45분',
    '1시간',
    '1.5시간',
    '2.1시간',
  ]);
});
