import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type FetchInit,
  frontendMissing,
  loadFrontendModule,
  mount,
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
        return reply(409, { error: 'This keyword already exists on this date' });
      rows.push(row);
      return reply(201, { keyword: row });
    }
    const one = base.match(/^\/api\/keywords\/(\d+)$/);
    assert.ok(one, 'unexpected request ' + path);
    const index = rows.findIndex((r) => r.id === Number(one[1]));
    if (index < 0) return reply(404, { error: 'Keyword not found' });
    if (method === 'PUT') {
      if (clash(body.date, body.keyword, rows[index].id))
        return reply(409, { error: 'This keyword already exists on this date' });
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
const dayCard = (ui: Ui, date = today) => section(ui, `Keywords for ${date}`);
const searchCard = (ui: Ui) => section(ui, 'Keyword search');
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
  await ui.click('Keyword');
  return ui;
}

uiTest("the page opens on today's keywords", async () => {
  const api = fakeApi(stored);
  const ui = await openKeywords(api);
  assert.equal(ui.field('Date'), today);
  assert.match(ui.text(dayCard(ui)), /Keywords for today \(2026-10-23\)/);
  assert.deepEqual(listed(ui, dayCard(ui)), ['고유값:Ax = λx', '대각화:']);
  assert.deepEqual(
    api.requests.map((r) => r.path),
    [`/api/keywords?date=${today}`],
  );
});

uiTest('a day without keywords says so', async () => {
  const ui = await openKeywords(fakeApi());
  assert.match(ui.text(dayCard(ui)), /No keywords on this date/);
});

uiTest('quick add saves to the picked date, clears the form and refocuses', async () => {
  const focused: string[] = [];
  const document = { getElementById: (id: string) => ({ focus: () => focused.push(id) }) };
  const api = fakeApi();
  const ui = await openKeywords(api, { document });
  await ui.fill('Keyword', '고유벡터');
  await ui.fill('Memo', 'λ에 대응하는 벡터');
  await ui.submit(section(ui, 'Keyword entry'));
  assert.deepEqual(
    api.requests.find((r) => r.method === 'POST'),
    {
      method: 'POST',
      path: '/api/keywords',
      body: { date: today, keyword: '고유벡터', memo: 'λ에 대응하는 벡터' },
    },
  );
  assert.deepEqual(listed(ui, dayCard(ui)), ['고유벡터:λ에 대응하는 벡터']);
  assert.equal(ui.field('Keyword'), '');
  assert.equal(ui.field('Memo'), '');
  assert.match(ui.text(section(ui, 'Keyword entry')), /Added/);
  assert.deepEqual(focused, ['keyword-input']);
});

uiTest(
  'picking another date lists and adds for that date, and Back to today comes back',
  async () => {
    const api = fakeApi(stored);
    const ui = await openKeywords(api);
    await ui.fill('Date', '2026-10-20');
    assert.deepEqual(listed(ui, dayCard(ui, '2026-10-20')), ['행렬식:고유값 계산에 쓴다']);
    await ui.fill('Keyword', '여인수');
    await ui.submit(section(ui, 'Keyword entry'));
    assert.equal(api.rows.at(-1)?.date, '2026-10-20');
    await ui.click('Back to today');
    assert.equal(ui.field('Date'), today);
    assert.deepEqual(listed(ui, dayCard(ui)), ['고유값:Ax = λx', '대각화:']);
  },
);

uiTest('a duplicate keyword shows the server message and keeps the input', async () => {
  const ui = await openKeywords(fakeApi(stored));
  await ui.fill('Keyword', '고유값');
  await ui.submit(section(ui, 'Keyword entry'));
  assert.match(alertText(ui), /This keyword already exists on this date/);
  assert.equal(ui.field('Keyword'), '고유값');
});

uiTest('editing replaces the keyword, and moving it to another date says where', async () => {
  const api = fakeApi(stored);
  const ui = await openKeywords(api);
  await ui.click('Edit', item(ui, '대각화'));
  const editing = () => ui.find((n) => n.props.className === 'editing', dayCard(ui))[0];
  await fillIn(ui, editing(), 'Memo', '대각 행렬로 바꾸기');
  await ui.submit(editing());
  assert.deepEqual(api.requests.find((r) => r.method === 'PUT')?.body, {
    date: today,
    keyword: '대각화',
    memo: '대각 행렬로 바꾸기',
  });
  assert.deepEqual(listed(ui, dayCard(ui)), ['고유값:Ax = λx', '대각화:대각 행렬로 바꾸기']);
  assert.match(ui.text(section(ui, 'Keyword entry')), /Updated/);

  await ui.click('Edit', item(ui, '고유값'));
  await fillIn(ui, editing(), 'Date', '2026-10-21');
  await ui.submit(editing());
  assert.deepEqual(listed(ui, dayCard(ui)), ['대각화:대각 행렬로 바꾸기']);
  assert.match(ui.text(section(ui, 'Keyword entry')), /Updated and moved to 2026-10-21/);
});

uiTest('deleting needs a confirmation', async () => {
  const api = fakeApi(stored);
  const ui = await openKeywords(api);
  await ui.click('Delete', item(ui, '고유값'));
  await ui.click('Cancel', item(ui, '고유값'));
  assert.equal(api.requests.filter((r) => r.method === 'DELETE').length, 0);
  await ui.click('Delete', item(ui, '고유값'));
  await ui.click('Confirm delete', item(ui, '고유값'));
  assert.deepEqual(
    api.requests.filter((r) => r.method === 'DELETE').map((r) => r.path),
    ['/api/keywords/1'],
  );
  assert.deepEqual(listed(ui, dayCard(ui)), ['대각화:']);
  assert.match(ui.text(section(ui, 'Keyword entry')), /Deleted/);
});

uiTest('saving an edit of a keyword deleted elsewhere closes the editor', async () => {
  const focused: string[] = [];
  const document = { getElementById: (id: string) => ({ focus: () => focused.push(id) }) };
  const api = fakeApi(stored);
  const ui = await openKeywords(api, { document });
  await ui.click('Edit', item(ui, '대각화'));
  api.rows.splice(1, 1);
  await ui.submit(ui.find((n) => n.props.className === 'editing', dayCard(ui))[0]);
  assert.match(alertText(ui), /Keyword not found/);
  assert.equal(ui.find((n) => n.props.className === 'editing', dayCard(ui)).length, 0);
  assert.deepEqual(listed(ui, dayCard(ui)), ['고유값:Ax = λx']);
  // The closed editor's buttons are gone; focus goes to the day heading.
  assert.deepEqual(focused, ['keyword-day']);
});

uiTest('search lists matches across dates and a date opens that day', async () => {
  const api = fakeApi(stored);
  const ui = await openKeywords(api);
  await ui.fill('Search term', ' 고유값 ');
  await ui.fill('Start date', '2026-10-01');
  await ui.submit(searchCard(ui));
  assert.equal(
    api.requests.at(-1)?.path,
    '/api/keywords?q=%EA%B3%A0%EC%9C%A0%EA%B0%92&from=2026-10-01',
  );
  assert.match(ui.text(searchCard(ui)), /Found 2/);
  // Newest date first; a memo match counts too.
  assert.deepEqual(listed(ui, searchCard(ui)), ['고유값:Ax = λx', '행렬식:고유값 계산에 쓴다']);
  await ui.click('2026-10-20', searchCard(ui));
  assert.equal(ui.field('Date'), '2026-10-20');
  assert.deepEqual(listed(ui, dayCard(ui, '2026-10-20')), ['행렬식:고유값 계산에 쓴다']);

  await ui.fill('Search term', '없는말');
  await ui.submit(searchCard(ui));
  assert.match(ui.text(searchCard(ui)), /No results/);
});

uiTest('changes refresh the shown search results', async () => {
  const api = fakeApi(stored);
  const ui = await openKeywords(api);
  await ui.fill('Search term', '고유');
  await ui.submit(searchCard(ui));
  assert.equal(listed(ui, searchCard(ui)).length, 2);
  await ui.fill('Keyword', '고유벡터');
  await ui.submit(section(ui, 'Keyword entry'));
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
  await ui.click('Delete', item(ui, '고유값'));
  await ui.click('Confirm delete', item(ui, '고유값'));
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
    reject: { method: 'GET', status: 500, error: 'Server error' },
  });
  const ui = await openKeywords(api);
  assert.match(ui.text(dayCard(ui)), /Could not load the keywords: Server error/);
  assert.doesNotMatch(ui.text(dayCard(ui)), /No keywords on this date/);
  await ui.submit(searchCard(ui));
  assert.match(ui.text(searchCard(ui)), /Could not search: Server error/);
});

uiTest('keyword buttons name the keyword they act on', async () => {
  const ui = await openKeywords(fakeApi([stored[1]]));
  const labels = ui
    .find((n) => n.type === 'button' && typeof n.props['aria-label'] === 'string', dayCard(ui))
    .map((n) => n.props['aria-label']);
  assert.deepEqual(labels, ['대각화 edit', '대각화 delete']);
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
  await ui.fill('Date', '');
  assert.equal(ui.field('Date'), today);
  assert.deepEqual(listed(ui, dayCard(ui)), ['고유값:Ax = λx', '대각화:']);
});

uiTest('a failed search is not brought back by a later change', async () => {
  const options: Options = {};
  const api = fakeApi(stored, options);
  const ui = await openKeywords(api);
  await ui.fill('Search term', '고유');
  await ui.submit(searchCard(ui));
  assert.equal(listed(ui, searchCard(ui)).length, 2);
  await ui.fill('Search term', '행렬');
  options.reject = { method: 'GET', status: 500, error: 'Server error' };
  await ui.submit(searchCard(ui));
  options.reject = undefined;
  assert.match(ui.text(searchCard(ui)), /Could not search/);
  await ui.fill('Keyword', '여인수');
  await ui.submit(section(ui, 'Keyword entry'));
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
  await ui.fill('Start date', '2026-10-10');
  await ui.fill('End date', '2026-10-20');
  const [from, to] = ui.find((n) => n.type === 'input' && n.props.type === 'date', searchCard(ui));
  assert.equal(from.props.max, '2026-10-20');
  assert.equal(to.props.min, '2026-10-10');
});

uiTest('after an edit, a cancel or a delete the day heading takes focus', async () => {
  const focused: string[] = [];
  const document = { getElementById: (id: string) => ({ focus: () => focused.push(id) }) };
  const ui = await openKeywords(fakeApi(stored), { document });
  await ui.click('Edit', item(ui, '대각화'));
  await ui.submit(ui.find((n) => n.props.className === 'editing', dayCard(ui))[0]);
  await ui.click('Edit', item(ui, '대각화'));
  await ui.click('Cancel', ui.find((n) => n.props.className === 'editing', dayCard(ui))[0]);
  await ui.click('Delete', item(ui, '대각화'));
  await ui.click('Confirm delete', item(ui, '대각화'));
  // Save, cancel, then the delete flow: its confirm button and the heading after (#86).
  assert.deepEqual(focused, [
    'keyword-day',
    'keyword-day',
    'keyword-delete-confirm-2',
    'keyword-day',
  ]);
});

// #75: two submits in the same tick, before the screen re-renders with `busy`, send one request.
uiTest('a double submit in the same tick adds the keyword once', async () => {
  const api = fakeApi();
  const ui = await openKeywords(api);
  await ui.fill('Keyword', '고유값');
  const [form] = ui.find((n) => n.type === 'form', section(ui, 'Keyword entry'));
  const onSubmit = form.props.onSubmit as (event: { preventDefault(): void }) => unknown;
  void onSubmit({ preventDefault() {} });
  void onSubmit({ preventDefault() {} });
  await ui.settle();
  assert.equal(api.requests.filter((r) => r.method === 'POST').length, 1);
  // The second submit did not get a 409 for the same keyword either.
  assert.equal(ui.find((n) => n.props.role === 'alert').length, 0);
});

// #86: records focused ids; an id with no element in the rendered tree (a typo) fails.
const focusRecorder = () => {
  const focused: string[] = [];
  const state: { ui?: ReturnType<typeof mount> } = {};
  const document = {
    getElementById: (id: string) => {
      if (state.ui && state.ui.find((n) => n.props.id === id).length !== 1)
        throw new Error(`no element #${id} to focus`);
      return { focus: () => focused.push(id) };
    },
  };
  return { focused, document, state };
};
// Clicks the button with this accessible name.
const press = async (ui: ReturnType<typeof mount>, name: string) => {
  const [button] = ui.find((n) => n.type === 'button' && n.props['aria-label'] === name);
  assert.ok(button, 'button ' + name);
  assert.ok(!button.props.disabled, 'button ' + name + ' is disabled');
  void (button.props.onClick as () => unknown)();
  await ui.settle();
};

uiTest('keyword delete focus: back on cancel and on a failure, heading on 404', async () => {
  const options: Options = {};
  const { focused, document, state } = focusRecorder();
  const api = fakeApi(stored, options);
  const ui = await openKeywords(api, { document });
  state.ui = ui;
  await press(ui, '대각화 delete');
  assert.equal(focused.at(-1), 'keyword-delete-confirm-2');
  await press(ui, '대각화 cancel deletion');
  assert.equal(focused.at(-1), 'keyword-delete-2');
  options.reject = { method: 'DELETE', status: 500, error: 'Server error' };
  await press(ui, '대각화 delete');
  await press(ui, '대각화 confirm deletion');
  assert.equal(focused.at(-1), 'keyword-delete-2');
  options.reject = undefined;
  api.rows.splice(1, 1);
  await press(ui, '대각화 delete');
  await press(ui, '대각화 confirm deletion');
  assert.equal(focused.at(-1), 'keyword-day');
});
