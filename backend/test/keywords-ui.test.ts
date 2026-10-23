import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  frontendMissing,
  loadFrontendModule,
  mount,
  type FetchInit,
  type Node,
} from './ui-harness.js';

const uiTest = frontendMissing ? test.skip : test;

type Keyword = { id: number; date: string; keyword: string; memo: string };

const today = '2026-10-23';

type Options = {
  // Every keyword request with this method answers this error instead.
  reject?: { method: string; status: number; error: string };
  // Changes (non-GET keyword requests) wait for this promise.
  holdChange?: Promise<void>;
};

// In-memory keywords API that records keyword requests. Search matches keyword or memo.
function fakeApi(initial: Keyword[] = [], options: Options = {}) {
  const rows = initial.map((row) => ({ ...row }));
  const requests: { method: string; path: string; body?: unknown }[] = [];
  let nextId = 100;
  const reply = (status: number, body?: unknown) => ({
    ok: status < 400,
    status,
    json: async () => body,
  });
  const fetch = async (path: string, init: FetchInit = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    if (path === '/api/health') return reply(200, { ok: true, today });
    if (path.startsWith('/api/study-logs')) return reply(200, { studyLogs: [] });
    if (path === '/api/textbooks') return reply(200, { textbooks: [] });
    requests.push({ method, path, body });
    if (method !== 'GET') await options.holdChange;
    if (options.reject?.method === method)
      return reply(options.reject.status, { error: options.reject.error });
    const [base, query = ''] = path.split('?');
    if (base === '/api/keywords' && method === 'GET') {
      const params = new URLSearchParams(query);
      const date = params.get('date');
      if (date) return reply(200, { keywords: rows.filter((r) => r.date === date) });
      const q = (params.get('q') ?? '').toLowerCase();
      const from = params.get('from') ?? '0000';
      const to = params.get('to') ?? '9999';
      return reply(200, {
        keywords: rows
          .filter(
            (r) =>
              (r.keyword.toLowerCase().includes(q) || r.memo.toLowerCase().includes(q)) &&
              r.date >= from &&
              r.date <= to,
          )
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id - b.id)),
      });
    }
    const clash = (date: string, keyword: string, id?: number) =>
      rows.some(
        (r) => r.id !== id && r.date === date && r.keyword.toLowerCase() === keyword.toLowerCase(),
      );
    if (base === '/api/keywords' && method === 'POST') {
      const row = {
        id: nextId++,
        date: body.date ?? today,
        keyword: body.keyword,
        memo: body.memo,
      };
      if (clash(row.date, row.keyword))
        return reply(409, { error: '이 날짜에 이미 있는 키워드입니다' });
      rows.push(row);
      return reply(201, { keyword: row });
    }
    const one = base.match(/^\/api\/keywords\/(\d+)$/);
    assert.ok(one, 'unexpected request ' + path);
    const index = rows.findIndex((r) => r.id === Number(one[1]));
    if (index < 0) return reply(404, { error: '키워드를 찾을 수 없습니다' });
    if (method === 'PUT') {
      if (clash(body.date, body.keyword, rows[index].id))
        return reply(409, { error: '이 날짜에 이미 있는 키워드입니다' });
      rows[index] = { ...rows[index], ...body };
      return reply(200, { keyword: rows[index] });
    }
    rows.splice(index, 1);
    return reply(204);
  };
  return { fetch, requests, rows };
}

const stored: Keyword[] = [
  { id: 1, date: today, keyword: '고유값', memo: 'Ax = λx' },
  { id: 2, date: today, keyword: '대각화', memo: '' },
  { id: 3, date: '2026-10-20', keyword: '행렬식', memo: '고유값 계산에 쓴다' },
];

type Ui = ReturnType<typeof mount>;
const section = (ui: Ui, label: string) =>
  ui.find((n) => n.type === 'section' && n.props['aria-label'] === label)[0];
const dayCard = (ui: Ui, date = today) => section(ui, `${date} 키워드`);
const searchCard = (ui: Ui) => section(ui, '키워드 검색');
// Each keyword of a list as "keyword:memo".
const listed = (ui: Ui, scope: Node | undefined) =>
  scope
    ? ui
        .find((n) => n.type === 'li', scope)
        .map(
          (li) =>
            ui.text(ui.find((n) => n.props.className === 'log-date', li)[0]) +
            ':' +
            ui.text(ui.find((n) => n.props.className === 'log-memo', li)[0] ?? ''),
        )
    : [];
const item = (ui: Ui, keyword: string) =>
  ui
    .find((n) => n.type === 'li', dayCard(ui))
    .find((li) => ui.text(ui.find((n) => n.props.className === 'log-date', li)[0]) === keyword)!;
// Types into the field whose label starts with `label` inside `scope`.
async function fillIn(ui: Ui, scope: Node, label: string, value: string) {
  const [field] = ui
    .find((n) => n.type === 'label' && ui.text(n).startsWith(label), scope)
    .flatMap((n) => ui.find((c) => c.type === 'input', n));
  assert.ok(field, 'field ' + label);
  (field.props.onChange as (e: { target: { value: string } }) => void)({ target: { value } });
  await ui.settle();
}
const alertText = (ui: Ui) => ui.text(ui.find((n) => n.props.role === 'alert'));

async function openKeywords(
  api: ReturnType<typeof fakeApi>,
  globals: Record<string, unknown> = {},
) {
  const ui = mount(api.fetch, globals);
  await ui.settle();
  await ui.click('키워드');
  return ui;
}

uiTest("the page opens on today's keywords", async () => {
  const api = fakeApi(stored);
  const ui = await openKeywords(api);
  assert.equal(ui.field('날짜'), today);
  assert.match(ui.text(dayCard(ui)), /오늘 \(2026-10-23\)의 키워드/);
  assert.deepEqual(listed(ui, dayCard(ui)), ['고유값:Ax = λx', '대각화:']);
  assert.deepEqual(
    api.requests.map((r) => r.path),
    [`/api/keywords?date=${today}`],
  );
});

uiTest('a day without keywords says so', async () => {
  const ui = await openKeywords(fakeApi());
  assert.match(ui.text(dayCard(ui)), /이 날짜에 남긴 키워드가 없습니다/);
});

uiTest('quick add saves to the picked date, clears the form and refocuses', async () => {
  const focused: string[] = [];
  const document = { getElementById: (id: string) => ({ focus: () => focused.push(id) }) };
  const api = fakeApi();
  const ui = await openKeywords(api, { document });
  await ui.fill('키워드', '고유벡터');
  await ui.fill('메모', 'λ에 대응하는 벡터');
  await ui.submit(section(ui, '키워드 입력'));
  assert.deepEqual(
    api.requests.find((r) => r.method === 'POST'),
    {
      method: 'POST',
      path: '/api/keywords',
      body: { date: today, keyword: '고유벡터', memo: 'λ에 대응하는 벡터' },
    },
  );
  assert.deepEqual(listed(ui, dayCard(ui)), ['고유벡터:λ에 대응하는 벡터']);
  assert.equal(ui.field('키워드'), '');
  assert.equal(ui.field('메모'), '');
  assert.match(ui.text(section(ui, '키워드 입력')), /추가했습니다/);
  assert.deepEqual(focused, ['keyword-input']);
});

uiTest('picking another date lists and adds for that date, and 오늘로 comes back', async () => {
  const api = fakeApi(stored);
  const ui = await openKeywords(api);
  await ui.fill('날짜', '2026-10-20');
  assert.deepEqual(listed(ui, dayCard(ui, '2026-10-20')), ['행렬식:고유값 계산에 쓴다']);
  await ui.fill('키워드', '여인수');
  await ui.submit(section(ui, '키워드 입력'));
  assert.equal(api.rows.at(-1)?.date, '2026-10-20');
  await ui.click('오늘로');
  assert.equal(ui.field('날짜'), today);
  assert.deepEqual(listed(ui, dayCard(ui)), ['고유값:Ax = λx', '대각화:']);
});

uiTest('a duplicate keyword shows the server message and keeps the input', async () => {
  const ui = await openKeywords(fakeApi(stored));
  await ui.fill('키워드', '고유값');
  await ui.submit(section(ui, '키워드 입력'));
  assert.match(alertText(ui), /이 날짜에 이미 있는 키워드입니다/);
  assert.equal(ui.field('키워드'), '고유값');
});

uiTest('editing replaces the keyword, and moving it to another date says where', async () => {
  const api = fakeApi(stored);
  const ui = await openKeywords(api);
  await ui.click('수정', item(ui, '대각화'));
  const editing = () => ui.find((n) => n.props.className === 'editing', dayCard(ui))[0];
  await fillIn(ui, editing(), '메모', '대각 행렬로 바꾸기');
  await ui.submit(editing());
  assert.deepEqual(api.requests.find((r) => r.method === 'PUT')?.body, {
    date: today,
    keyword: '대각화',
    memo: '대각 행렬로 바꾸기',
  });
  assert.deepEqual(listed(ui, dayCard(ui)), ['고유값:Ax = λx', '대각화:대각 행렬로 바꾸기']);
  assert.match(ui.text(section(ui, '키워드 입력')), /수정했습니다/);

  await ui.click('수정', item(ui, '고유값'));
  await fillIn(ui, editing(), '날짜', '2026-10-21');
  await ui.submit(editing());
  assert.deepEqual(listed(ui, dayCard(ui)), ['대각화:대각 행렬로 바꾸기']);
  assert.match(ui.text(section(ui, '키워드 입력')), /수정해서 2026-10-21로 옮겼습니다/);
});

uiTest('deleting needs a confirmation', async () => {
  const api = fakeApi(stored);
  const ui = await openKeywords(api);
  await ui.click('삭제', item(ui, '고유값'));
  await ui.click('취소', item(ui, '고유값'));
  assert.equal(api.requests.filter((r) => r.method === 'DELETE').length, 0);
  await ui.click('삭제', item(ui, '고유값'));
  await ui.click('삭제 확인', item(ui, '고유값'));
  assert.deepEqual(
    api.requests.filter((r) => r.method === 'DELETE').map((r) => r.path),
    ['/api/keywords/1'],
  );
  assert.deepEqual(listed(ui, dayCard(ui)), ['대각화:']);
  assert.match(ui.text(section(ui, '키워드 입력')), /삭제했습니다/);
});

uiTest('saving an edit of a keyword deleted elsewhere closes the editor', async () => {
  const api = fakeApi(stored);
  const ui = await openKeywords(api);
  await ui.click('수정', item(ui, '대각화'));
  api.rows.splice(1, 1);
  await ui.submit(ui.find((n) => n.props.className === 'editing', dayCard(ui))[0]);
  assert.match(alertText(ui), /키워드를 찾을 수 없습니다/);
  assert.equal(ui.find((n) => n.props.className === 'editing', dayCard(ui)).length, 0);
  assert.deepEqual(listed(ui, dayCard(ui)), ['고유값:Ax = λx']);
});

uiTest('search lists matches across dates and a date opens that day', async () => {
  const api = fakeApi(stored);
  const ui = await openKeywords(api);
  await ui.fill('검색어', ' 고유값 ');
  await ui.fill('시작일', '2026-10-01');
  await ui.submit(searchCard(ui));
  assert.equal(
    api.requests.at(-1)?.path,
    '/api/keywords?q=%EA%B3%A0%EC%9C%A0%EA%B0%92&from=2026-10-01',
  );
  assert.match(ui.text(searchCard(ui)), /2개를 찾았습니다/);
  // Newest date first; a memo match counts too.
  assert.deepEqual(listed(ui, searchCard(ui)), ['고유값:Ax = λx', '행렬식:고유값 계산에 쓴다']);
  await ui.click('2026-10-20', searchCard(ui));
  assert.equal(ui.field('날짜'), '2026-10-20');
  assert.deepEqual(listed(ui, dayCard(ui, '2026-10-20')), ['행렬식:고유값 계산에 쓴다']);

  await ui.fill('검색어', '없는말');
  await ui.submit(searchCard(ui));
  assert.match(ui.text(searchCard(ui)), /검색 결과가 없습니다/);
});

uiTest('changes refresh the shown search results', async () => {
  const api = fakeApi(stored);
  const ui = await openKeywords(api);
  await ui.fill('검색어', '고유');
  await ui.submit(searchCard(ui));
  assert.equal(listed(ui, searchCard(ui)).length, 2);
  await ui.fill('키워드', '고유벡터');
  await ui.submit(section(ui, '키워드 입력'));
  assert.deepEqual(listed(ui, searchCard(ui)), [
    '고유값:Ax = λx',
    '고유벡터:',
    '행렬식:고유값 계산에 쓴다',
  ]);
});

uiTest('controls are locked while a change is pending', async () => {
  let release = () => {};
  const api = fakeApi(stored, { holdChange: new Promise<void>((r) => (release = r)) });
  const ui = await openKeywords(api);
  await ui.click('삭제', item(ui, '고유값'));
  await ui.click('삭제 확인', item(ui, '고유값'));
  const controls = ui.find(
    (n) => (n.type === 'button' || n.type === 'input') && n.props.disabled !== undefined,
    ui.find((n) => n.props.className === 'keywords')[0],
  );
  assert.ok(controls.length > 0 && controls.every((n) => n.props.disabled));
  release();
  await ui.settle();
  assert.deepEqual(listed(ui, dayCard(ui)), ['대각화:']);
});

uiTest('failed loads are reported instead of claiming there is nothing', async () => {
  const api = fakeApi(stored, {
    reject: { method: 'GET', status: 500, error: '서버 오류가 발생했습니다' },
  });
  const ui = await openKeywords(api);
  assert.match(ui.text(dayCard(ui)), /키워드를 불러오지 못했습니다: 서버 오류가 발생했습니다/);
  assert.doesNotMatch(ui.text(dayCard(ui)), /남긴 키워드가 없습니다/);
  await ui.submit(searchCard(ui));
  assert.match(ui.text(searchCard(ui)), /검색하지 못했습니다: 서버 오류가 발생했습니다/);
});

uiTest('keyword buttons name the keyword they act on', async () => {
  const ui = await openKeywords(fakeApi([stored[1]]));
  const labels = ui
    .find((n) => n.type === 'button' && typeof n.props['aria-label'] === 'string', dayCard(ui))
    .map((n) => n.props['aria-label']);
  assert.deepEqual(labels, ['대각화 수정', '대각화 삭제']);
});

uiTest('the search request leaves out blank fields', () => {
  const { searchPath } = loadFrontendModule<{
    searchPath(search: { q: string; from: string; to: string }): string;
  }>('keyword.ts');
  assert.equal(searchPath({ q: '  ', from: '', to: '' }), '/api/keywords');
  assert.equal(
    searchPath({ q: '50%', from: '', to: '2026-10-31' }),
    '/api/keywords?q=50%25&to=2026-10-31',
  );
});

uiTest('clearing the date field keeps the last picked date', async () => {
  const ui = await openKeywords(fakeApi(stored));
  await ui.fill('날짜', '');
  assert.equal(ui.field('날짜'), today);
  assert.deepEqual(listed(ui, dayCard(ui)), ['고유값:Ax = λx', '대각화:']);
});

uiTest('a failed search is not brought back by a later change', async () => {
  const options: Options = {};
  const api = fakeApi(stored, options);
  const ui = await openKeywords(api);
  await ui.fill('검색어', '고유');
  await ui.submit(searchCard(ui));
  assert.equal(listed(ui, searchCard(ui)).length, 2);
  await ui.fill('검색어', '행렬');
  options.reject = { method: 'GET', status: 500, error: '서버 오류가 발생했습니다' };
  await ui.submit(searchCard(ui));
  options.reject = undefined;
  assert.match(ui.text(searchCard(ui)), /검색하지 못했습니다/);
  await ui.fill('키워드', '여인수');
  await ui.submit(section(ui, '키워드 입력'));
  // No results of the old "고유" search under the "행렬" query.
  assert.deepEqual(listed(ui, searchCard(ui)), []);
  assert.equal(
    api.requests.filter((r) => r.path.includes('q=')).length,
    2,
    'the failed search is not re-run',
  );
});

uiTest('the search dates cannot cross', async () => {
  const ui = await openKeywords(fakeApi());
  await ui.fill('시작일', '2026-10-10');
  await ui.fill('종료일', '2026-10-20');
  const [from, to] = ui.find((n) => n.type === 'input' && n.props.type === 'date', searchCard(ui));
  assert.equal(from.props.max, '2026-10-20');
  assert.equal(to.props.min, '2026-10-10');
});

uiTest('after an edit, a cancel or a delete the day heading takes focus', async () => {
  const focused: string[] = [];
  const document = { getElementById: (id: string) => ({ focus: () => focused.push(id) }) };
  const ui = await openKeywords(fakeApi(stored), { document });
  await ui.click('수정', item(ui, '대각화'));
  await ui.submit(ui.find((n) => n.props.className === 'editing', dayCard(ui))[0]);
  await ui.click('수정', item(ui, '대각화'));
  await ui.click('취소', ui.find((n) => n.props.className === 'editing', dayCard(ui))[0]);
  await ui.click('삭제', item(ui, '대각화'));
  await ui.click('삭제 확인', item(ui, '대각화'));
  assert.deepEqual(focused, ['keyword-day', 'keyword-day', 'keyword-day']);
});
