import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type FetchInit, frontendMissing, loadFrontendModule, mount } from './ui-harness.js';

const uiTest = frontendMissing ? test.skip : test;

type Log = {
  id: number;
  studyDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  memo: string;
  difficulties: string;
  status: string;
  textbookId: number | null;
  textbookTitle: string | null;
  contentId: null;
  contentNumber: null;
  contentTitle: null;
  understanding: null;
  goalAchieved: null;
};

const log = (
  id: number,
  studyDate: string,
  memo: string,
  difficulties = '',
  book?: number,
): Log => ({
  id,
  studyDate,
  startTime: '09:00',
  endTime: '10:00',
  durationMinutes: 60,
  memo,
  difficulties,
  status: 'done',
  textbookId: book ?? null,
  textbookTitle: book ? '선형대수' : null,
  contentId: null,
  contentNumber: null,
  contentTitle: null,
  understanding: null,
  goalAchieved: null,
});

const stored = [
  log(1, '2026-10-20', '고유값 정리', '', 1),
  log(2, '2026-10-12', '미적분', '고유벡터가 어려움'),
  log(3, '2026-09-01', '행렬'),
];

// The study log API filtering like the server; records search requests (those with a limit of
// 100, which only the search card asks for).
function fakeApi(initial: Log[], options: { failSearch?: boolean } = {}) {
  const logs = [...initial];
  const searches: string[] = [];
  const reply = (status: number, body: unknown) => ({
    ok: status < 400,
    status,
    json: async () => body,
  });
  const fetch = async (path: string, init: FetchInit = {}) => {
    const method = init.method ?? 'GET';
    if (path === '/api/health') return reply(200, { ok: true, today: '2026-10-22' });
    if (path === '/api/textbooks')
      return reply(200, { textbooks: [{ id: 1, title: '선형대수', author: '', edition: '' }] });
    if (path.startsWith('/api/study-logs/calendar'))
      return reply(200, { month: '2026-10', days: [] });
    if (path === '/api/study-logs' && method === 'POST') {
      const body = JSON.parse(init.body ?? '{}');
      logs.push(log(100 + logs.length, body.studyDate, body.memo));
      return reply(201, { studyLog: logs.at(-1) });
    }
    const [base, query = ''] = path.split('?');
    assert.equal(base, '/api/study-logs', 'unexpected request ' + path);
    const params = Object.fromEntries(
      query
        .split('&')
        .filter(Boolean)
        .map((pair) => pair.split('=').map(decodeURIComponent)),
    );
    if (params.limit === '100') {
      searches.push(path);
      if (options.failSearch) return reply(500, { error: '서버 오류가 발생했습니다' });
    }
    const words = (params.q ?? '').toLowerCase();
    const found = logs.filter(
      (l) =>
        (!params.date || l.studyDate === params.date) &&
        (!words || l.memo.toLowerCase().includes(words) || l.difficulties.includes(words)) &&
        (!params.from || l.studyDate >= params.from) &&
        (!params.to || l.studyDate <= params.to) &&
        (!params.textbookId || l.textbookId === Number(params.textbookId)),
    );
    return reply(200, { studyLogs: found });
  };
  return { fetch, searches };
}

type Ui = ReturnType<typeof mount>;
const card = (ui: Ui) => ui.find((n) => n.props['aria-label'] === '학습 기록 검색')[0];
const results = (ui: Ui) =>
  ui
    .find(
      (n) => n.type === 'li',
      ui.find((n) => n.props.className === 'log-list search-results')[0] ?? card(ui),
    )
    .map((li) => ui.text(li));
// Types into a field of the search card by its label.
async function fillIn(ui: Ui, label: string, value: string) {
  const [field] = ui
    .find((n) => n.type === 'label' && ui.text(n).startsWith(label), card(ui))
    .flatMap((n) => ui.find((c) => c.type === 'input' || c.type === 'select', n));
  assert.ok(field, 'field ' + label);
  (field.props.onChange as (e: { target: { value: string } }) => void)({ target: { value } });
  await ui.settle();
}
async function open(api: ReturnType<typeof fakeApi>) {
  const ui = mount(api.fetch);
  await ui.settle();
  return ui;
}

uiTest('a search asks with every filled condition and lists the matches', async () => {
  const api = fakeApi(stored);
  const ui = await open(api);
  await fillIn(ui, '검색어', ' 고유 ');
  await fillIn(ui, '시작일', '2026-10-01');
  await ui.submit(card(ui));
  assert.deepEqual(api.searches, [
    '/api/study-logs?q=%EA%B3%A0%EC%9C%A0&from=2026-10-01&limit=100',
  ]);
  assert.match(ui.text(card(ui)), /2개를 찾았습니다/);
  const found = results(ui);
  assert.equal(found.length, 2);
  assert.match(found[0], /2026-10-20.*1시간.*완료.*선형대수.*고유값 정리/s);
  assert.match(found[1], /어려웠던 부분: 고유벡터가 어려움/);
});

uiTest('the textbook condition narrows the search', async () => {
  const api = fakeApi(stored);
  const ui = await open(api);
  const [select] = ui.find((n) => n.type === 'select', card(ui));
  assert.deepEqual(
    ui.find((n) => n.type === 'option', select).map((n) => ui.text(n)),
    ['전체', '선형대수'],
  );
  await fillIn(ui, '교재', '1');
  await ui.submit(card(ui));
  assert.equal(api.searches.at(-1), '/api/study-logs?textbookId=1&limit=100');
  assert.equal(results(ui).length, 1);
});

uiTest('no match says so and a failed search is reported without old results', async () => {
  const api = fakeApi(stored);
  const ui = await open(api);
  await fillIn(ui, '검색어', '없는말');
  await ui.submit(card(ui));
  assert.match(ui.text(card(ui)), /검색 결과가 없습니다/);

  const failing = fakeApi(stored, { failSearch: true });
  const ui2 = await open(failing);
  await ui2.submit(card(ui2));
  assert.match(ui2.text(card(ui2)), /검색하지 못했습니다: 서버 오류가 발생했습니다/);
  assert.equal(results(ui2).length, 0);
});

uiTest('saving a log searches the shown results again', async () => {
  const api = fakeApi(stored);
  const ui = await open(api);
  await fillIn(ui, '검색어', '고유');
  await ui.submit(card(ui));
  assert.equal(results(ui).length, 2);
  // The entry form is the page's first form.
  await ui.fill('시작', '13:00');
  await ui.fill('종료', '14:00');
  await ui.fill('메모', '고유값 복습');
  await ui.submit();
  assert.equal(api.searches.length, 2);
  assert.equal(results(ui).length, 3);
});

uiTest('the search request leaves out blank conditions', () => {
  const { studyLogSearchPath } = loadFrontendModule<{
    studyLogSearchPath(search: { q: string; from: string; to: string; textbookId: string }): string;
  }>('study-logs.ts');
  assert.equal(
    studyLogSearchPath({ q: '  ', from: '', to: '', textbookId: '' }),
    '/api/study-logs?limit=100',
  );
  assert.equal(
    studyLogSearchPath({ q: '50%', from: '', to: '2026-10-31', textbookId: '3' }),
    '/api/study-logs?q=50%25&to=2026-10-31&textbookId=3&limit=100',
  );
});
