import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendMissing, loadFrontendModule, mount, type FetchInit } from './ui-harness.js';

const uiTest = frontendMissing ? test.skip : test;

type Row = {
  id: number;
  textbookId: number;
  parentId: number | null;
  number: string;
  title: string;
};
type Tree = {
  id: number;
  parentId: number | null;
  number: string;
  title: string;
  children: Tree[];
};

const books = [
  { id: 1, title: '선형대수', author: '', edition: '' },
  { id: 2, title: '미적분', author: '', edition: '' },
];

type Options = {
  // DELETE answers this error instead of deleting.
  rejectDelete?: { status: number; error: string };
};

// In-memory /api/textbooks/:id/contents with the API's ordering rules; records content requests.
function fakeApi(initial: Row[] = [], options: Options = {}) {
  const rows = [...initial];
  const requests: { method: string; path: string; body?: unknown }[] = [];
  let nextId = 100;
  const reply = (status: number, body?: unknown) => ({
    ok: status < 400,
    status,
    json: async () => body,
  });
  const treeOf = (textbookId: number, parentId: number | null = null): Tree[] =>
    rows
      .filter((row) => row.textbookId === textbookId && row.parentId === parentId)
      .map(({ id, number, title }) => ({
        id,
        parentId,
        number,
        title,
        children: treeOf(textbookId, id),
      }));
  const fetch = async (path: string, init: FetchInit = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    if (path === '/api/health') return reply(200, { ok: true, today: '2026-10-22' });
    if (path.startsWith('/api/study-logs')) return reply(200, { studyLogs: [] });
    if (path === '/api/textbooks') return reply(200, { textbooks: books });
    const match = path.match(/^\/api\/textbooks\/(\d+)\/contents(?:\/(\w+))?$/);
    assert.ok(match, 'unexpected request ' + path);
    requests.push({ method, path, body });
    const textbookId = Number(match[1]);
    const target = match[2];
    if (method === 'GET') return reply(200, { contents: treeOf(textbookId) });
    if (method === 'POST') {
      const row = {
        id: nextId++,
        textbookId,
        parentId: body.parentId ?? null,
        number: body.number,
        title: body.title,
      };
      rows.push(row);
      return reply(201, { content: row });
    }
    if (target === 'order') {
      // Rows are kept in sibling order, so reordering means moving them to the given order.
      const moved = body.ids.map((id: number) => rows.find((row) => row.id === id)!);
      const rest = rows.filter((row) => !body.ids.includes(row.id));
      rows.splice(0, rows.length, ...rest, ...moved);
      return reply(200, { contents: treeOf(textbookId) });
    }
    const index = rows.findIndex((row) => row.id === Number(target));
    if (index < 0) return reply(404, { error: '목차를 찾을 수 없습니다' });
    if (method === 'PUT') {
      rows[index] = { ...rows[index], number: body.number, title: body.title };
      return reply(200, { content: rows[index] });
    }
    if (options.rejectDelete)
      return reply(options.rejectDelete.status, { error: options.rejectDelete.error });
    const gone = new Set([rows[index].id]);
    for (const row of rows) if (row.parentId !== null && gone.has(row.parentId)) gone.add(row.id);
    rows.splice(0, rows.length, ...rows.filter((row) => !gone.has(row.id)));
    return reply(204);
  };
  return { fetch, requests, rows };
}

const outline: Row[] = [
  { id: 1, textbookId: 1, parentId: null, number: '1', title: '벡터' },
  { id: 2, textbookId: 1, parentId: 1, number: '1.1', title: '덧셈' },
  { id: 3, textbookId: 1, parentId: 1, number: '1.2', title: '내적' },
  { id: 4, textbookId: 1, parentId: null, number: '2', title: '행렬' },
  { id: 5, textbookId: 2, parentId: null, number: '', title: '극한' },
];

// Opens the 교재 page and selects a textbook; only content requests from here on are counted.
async function openBook(api: ReturnType<typeof fakeApi>, title = '선형대수') {
  const ui = mount(api.fetch);
  await ui.settle();
  await ui.click('교재');
  await ui.click(title);
  return ui;
}

type Ui = ReturnType<typeof mount>;
const card = (ui: Ui) => ui.find((n) => n.props.className === 'contents')[0];
// The tree as "1 벡터[1.1 덧셈|1.2 내적]|2 행렬", read from the rendered labels.
const shape = (ui: Ui, node: unknown = card(ui)): string => {
  const [list] = ui.find((n) => n.props.className === 'content-tree', node);
  if (!list) return '';
  return list.props.children
    .flat()
    .filter((item: unknown) => item && typeof item === 'object')
    .map((item: unknown) => {
      const label = ui.text(ui.find((n) => n.props.className === 'content-label', item)[0]);
      const nested = (item as { props: { children: unknown[] } }).props.children[1];
      const inner = nested ? shape(ui, nested) : '';
      return inner ? `${label}[${inner}]` : label;
    })
    .join('|');
};
const row = (ui: Ui, label: string) =>
  ui
    .find((n) => n.props.className === 'content-row' || n.props.className === 'content-row editing')
    .find((n) => ui.text(ui.find((c) => c.props.className === 'content-label', n)[0]) === label)!;

uiTest('selecting a textbook shows its contents as a tree', async () => {
  const api = fakeApi(outline);
  const ui = await openBook(api);
  assert.deepEqual(api.requests, [
    { method: 'GET', path: '/api/textbooks/1/contents', body: undefined },
  ]);
  assert.equal(shape(ui), '1 벡터[1.1 덧셈|1.2 내적]|2 행렬');
  // Switching textbooks shows the other textbook's contents; a blank number shows only the title.
  await ui.click('미적분');
  assert.equal(shape(ui), '극한');
});

uiTest('a textbook without contents says so', async () => {
  const ui = await openBook(fakeApi());
  assert.match(ui.text(card(ui)), /아직 목차가 없습니다/);
});

uiTest('adding a chapter and a section posts them and reloads the tree', async () => {
  const api = fakeApi();
  const ui = await openBook(api);
  await ui.click('장 추가');
  assert.match(ui.text(card(ui)), /장 추가/);
  await ui.fill('번호', '1');
  await ui.fill('목차 제목', '벡터');
  await ui.submit(ui.find((n) => n.props.className === 'log-form content-form')[0]);
  assert.deepEqual(api.requests[1], {
    method: 'POST',
    path: '/api/textbooks/1/contents',
    body: { number: '1', title: '벡터', parentId: null },
  });
  assert.match(ui.text(card(ui)), /추가했습니다/);
  assert.equal(shape(ui), '1 벡터');
  // The editor closes after saving.
  assert.equal(ui.find((n) => n.props.className === 'log-form content-form').length, 0);

  await ui.click('하위 추가', row(ui, '1 벡터'));
  assert.match(ui.text(card(ui)), /'1 벡터' 아래에 추가/);
  await ui.fill('번호', '1.1');
  await ui.fill('목차 제목', '덧셈');
  await ui.submit(ui.find((n) => n.props.className === 'log-form content-form')[0]);
  assert.deepEqual(api.requests.filter((r) => r.method === 'POST')[1].body, {
    number: '1.1',
    title: '덧셈',
    parentId: 100,
  });
  assert.equal(shape(ui), '1 벡터[1.1 덧셈]');
});

uiTest('editing an entry saves its number and title with PUT', async () => {
  const api = fakeApi(outline);
  const ui = await openBook(api);
  await ui.click('수정', row(ui, '1.2 내적'));
  assert.match(ui.text(card(ui)), /목차 수정/);
  assert.equal(ui.field('번호'), '1.2');
  assert.equal(ui.field('목차 제목'), '내적');
  await ui.fill('목차 제목', '내적과 길이');
  await ui.submit(ui.find((n) => n.props.className === 'log-form content-form')[0]);
  assert.deepEqual(
    api.requests.find((r) => r.method === 'PUT'),
    {
      method: 'PUT',
      path: '/api/textbooks/1/contents/3',
      body: { number: '1.2', title: '내적과 길이' },
    },
  );
  assert.equal(shape(ui), '1 벡터[1.1 덧셈|1.2 내적과 길이]|2 행렬');
  assert.match(ui.text(card(ui)), /수정했습니다/);
});

uiTest('moving an entry sends its siblings in the new order', async () => {
  const api = fakeApi(outline);
  const ui = await openBook(api);
  // First and last siblings cannot move past the ends.
  const disabled = (label: string, button: string) =>
    ui.find((n) => n.type === 'button' && ui.text(n) === button, row(ui, label))[0].props.disabled;
  assert.equal(disabled('1 벡터', '위로'), true);
  assert.equal(disabled('2 행렬', '아래로'), true);
  assert.equal(disabled('1.1 덧셈', '아래로'), false);

  await ui.click('아래로', row(ui, '1.1 덧셈'));
  assert.deepEqual(api.requests.at(-1), {
    method: 'PUT',
    path: '/api/textbooks/1/contents/order',
    body: { parentId: 1, ids: [3, 2] },
  });
  assert.equal(shape(ui), '1 벡터[1.2 내적|1.1 덧셈]|2 행렬');
  await ui.click('위로', row(ui, '2 행렬'));
  assert.deepEqual(api.requests.at(-1)?.body, { parentId: null, ids: [4, 1] });
  assert.equal(shape(ui), '2 행렬|1 벡터[1.2 내적|1.1 덧셈]');
});

uiTest('deleting needs a confirmation and removes the entry with its sections', async () => {
  const api = fakeApi(outline);
  const ui = await openBook(api);
  await ui.click('삭제', row(ui, '1 벡터'));
  await ui.click('취소', row(ui, '1 벡터'));
  assert.equal(api.requests.filter((r) => r.method === 'DELETE').length, 0);
  await ui.click('삭제', row(ui, '1 벡터'));
  await ui.click('삭제 확인', row(ui, '1 벡터'));
  assert.deepEqual(
    api.requests.filter((r) => r.method === 'DELETE').map((r) => r.path),
    ['/api/textbooks/1/contents/1'],
  );
  assert.equal(shape(ui), '2 행렬');
  assert.match(ui.text(card(ui)), /삭제했습니다/);
});

uiTest('a delete refused because study logs use the entry shows the server message', async () => {
  const api = fakeApi(outline, {
    rejectDelete: { status: 409, error: '학습 기록이 연결된 목차는 삭제할 수 없습니다' },
  });
  const ui = await openBook(api);
  await ui.click('수정', row(ui, '2 행렬'));
  await ui.click('삭제', row(ui, '1.2 내적'));
  await ui.click('삭제 확인', row(ui, '1.2 내적'));
  assert.match(
    ui.text(ui.find((n) => n.props.role === 'alert', card(ui))),
    /학습 기록이 연결된 목차는 삭제할 수 없습니다/,
  );
  assert.equal(shape(ui), '1 벡터[1.1 덧셈|1.2 내적]|2 행렬');
  // The edit of another entry stays open.
  assert.equal(ui.field('목차 제목'), '행렬');
});

uiTest('saving an edit of an entry deleted elsewhere closes the editor and reloads', async () => {
  const api = fakeApi(outline);
  const ui = await openBook(api);
  await ui.click('수정', row(ui, '2 행렬'));
  api.rows.splice(3, 1);
  await ui.submit(ui.find((n) => n.props.className === 'log-form content-form')[0]);
  assert.match(
    ui.text(ui.find((n) => n.props.role === 'alert', card(ui))),
    /목차를 찾을 수 없습니다/,
  );
  assert.equal(ui.find((n) => n.props.className === 'log-form content-form').length, 0);
  assert.equal(shape(ui), '1 벡터[1.1 덧셈|1.2 내적]');
});

uiTest('switching textbooks closes an open editor of the previous one', async () => {
  const ui = await openBook(fakeApi(outline));
  await ui.click('수정', row(ui, '2 행렬'));
  await ui.click('미적분');
  assert.equal(ui.find((n) => n.props.className === 'log-form content-form').length, 0);
  assert.equal(shape(ui), '극한');
});

uiTest('row buttons name the entry they act on', async () => {
  const ui = await openBook(fakeApi([outline[4]]), '미적분');
  const labels = ui
    .find((n) => n.type === 'button' && typeof n.props['aria-label'] === 'string', card(ui))
    .map((n) => n.props['aria-label']);
  assert.deepEqual(labels, [
    '극한 위로 이동',
    '극한 아래로 이동',
    '극한 아래에 추가',
    '극한 목차 수정',
    '극한 목차 삭제',
  ]);
});

uiTest('content labels and select options follow the tree', () => {
  const logic = loadFrontendModule<{
    contentLabel(node: { number: string; title: string }): string;
  }>('textbook.ts');
  assert.equal(logic.contentLabel({ number: '1.2', title: '내적' }), '1.2 내적');
  assert.equal(logic.contentLabel({ number: ' ', title: '부록' }), '부록');
});
