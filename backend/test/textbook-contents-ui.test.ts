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
  // PUT /order answers this error instead of reordering.
  rejectOrder?: { status: number; error: string };
  // Every GET after the first waits for this promise.
  holdReload?: Promise<void>;
  // POST /bulk answers this error instead of adding.
  rejectBulk?: { status: number; error: string };
};

// In-memory /api/textbooks/:id/contents with the API's ordering rules; records content requests.
function fakeApi(initial: Row[] = [], options: Options = {}) {
  const rows = [...initial];
  const requests: { method: string; path: string; body?: unknown }[] = [];
  let nextId = 100;
  let gets = 0;
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
    if (method === 'GET') {
      if (++gets > 1) await options.holdReload;
      return reply(200, { contents: treeOf(textbookId) });
    }
    if (method === 'POST' && target === 'bulk') {
      if (options.rejectBulk)
        return reply(options.rejectBulk.status, { error: options.rejectBulk.error });
      // Like the API: each entry goes under the latest entry one level up.
      const path: number[] = [];
      for (const entry of body.entries as { level: number; number: string; title: string }[]) {
        const row = {
          id: nextId++,
          textbookId,
          parentId: entry.level ? path[entry.level - 1] : null,
          number: entry.number,
          title: entry.title,
        };
        rows.push(row);
        path.length = entry.level;
        path.push(row.id);
      }
      return reply(201, { contents: treeOf(textbookId) });
    }
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
      if (options.rejectOrder)
        return reply(options.rejectOrder.status, { error: options.rejectOrder.error });
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
async function openBook(
  api: ReturnType<typeof fakeApi>,
  title = '선형대수',
  modules: Record<string, unknown> = {},
) {
  const ui = mount(api.fetch, {}, modules);
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
    '극한 하위 추가',
    '극한 목차 수정',
    '극한 목차 삭제',
  ]);
});

uiTest('buttons stay locked until the tree is reloaded after a change', async () => {
  let release = () => {};
  const api = fakeApi(outline, { holdReload: new Promise<void>((r) => (release = r)) });
  const ui = await openBook(api);
  await ui.click('장 추가');
  await ui.fill('번호', '3');
  await ui.fill('목차 제목', '행렬식');
  await ui.submit(ui.find((n) => n.props.className === 'log-form content-form')[0]);
  // Saved, but the reload is still pending: moving now would start from the old tree.
  const moves = ui
    .find(
      (n) => n.type === 'button' && ['위로', '아래로', '장 추가'].includes(ui.text(n)),
      card(ui),
    )
    .map((n) => n.props.disabled);
  assert.ok(moves.length > 0 && moves.every(Boolean), 'all disabled while reloading');
  release();
  await ui.settle();
  assert.equal(shape(ui), '1 벡터[1.1 덧셈|1.2 내적]|2 행렬|3 행렬식');
  assert.equal(
    ui.find((n) => n.type === 'button' && ui.text(n) === '위로', row(ui, '3 행렬식'))[0].props
      .disabled,
    false,
  );
});

uiTest('a refused reorder shows the server message and reloads the tree', async () => {
  const api = fakeApi(outline, {
    rejectOrder: { status: 400, error: '같은 상위 목차의 모든 항목을 한 번씩 보내야 합니다' },
  });
  const ui = await openBook(api);
  await ui.click('아래로', row(ui, '1 벡터'));
  assert.match(
    ui.text(ui.find((n) => n.props.role === 'alert', card(ui))),
    /같은 상위 목차의 모든 항목을 한 번씩 보내야 합니다/,
  );
  assert.deepEqual(
    api.requests.map((r) => r.method),
    ['GET', 'PUT', 'GET'],
  );
  assert.equal(shape(ui), '1 벡터[1.1 덧셈|1.2 내적]|2 행렬');
});

uiTest('content labels show the number before the title when there is one', () => {
  const logic = loadFrontendModule<{
    contentLabel(node: { number: string; title: string }): string;
  }>('textbook.ts');
  assert.equal(logic.contentLabel({ number: '1.2', title: '내적' }), '1.2 내적');
  assert.equal(logic.contentLabel({ number: ' ', title: '부록' }), '부록');
});

// #75: two submits in the same tick, before the screen re-renders with `busy`, send one request.
uiTest('a double submit in the same tick adds the chapter once', async () => {
  const api = fakeApi();
  const ui = await openBook(api);
  await ui.click('장 추가');
  await ui.fill('목차 제목', '벡터');
  const [form] = ui.find((n) => n.props.className === 'log-form content-form');
  const onSubmit = form.props.onSubmit as (event: { preventDefault(): void }) => unknown;
  void onSubmit({ preventDefault() {} });
  void onSubmit({ preventDefault() {} });
  await ui.settle();
  assert.equal(api.requests.filter((r) => r.method === 'POST').length, 1);
  assert.equal(shape(ui), '벡터');
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

uiTest(
  'contents delete focus: confirm, back on cancel, button on failure, heading after',
  async () => {
    const options: Options = {};
    const { focused, document, state } = focusRecorder();
    const api = fakeApi(outline, options);
    const ui = mount(api.fetch, { document });
    state.ui = ui;
    await ui.settle();
    await ui.click('교재');
    await ui.click('선형대수');
    await press(ui, '2 행렬 목차 삭제');
    assert.equal(focused.at(-1), 'content-delete-confirm-4');
    await press(ui, '2 행렬 목차 삭제 취소');
    assert.equal(focused.at(-1), 'content-delete-4');
    // Study logs still point at it: the entry stays with its delete button.
    options.rejectDelete = { status: 409, error: '학습 기록이 연결된 목차는 삭제할 수 없습니다' };
    await press(ui, '2 행렬 목차 삭제');
    await press(ui, '2 행렬 목차 삭제 확인');
    assert.equal(focused.at(-1), 'content-delete-4');
    options.rejectDelete = undefined;
    await press(ui, '2 행렬 목차 삭제');
    await press(ui, '2 행렬 목차 삭제 확인');
    assert.equal(shape(ui), '1 벡터[1.1 덧셈|1.2 내적]');
    assert.equal(focused.at(-1), 'contents-heading');
  },
);

const pasteForm = (ui: Ui) =>
  ui.find((n) => n.props.className === 'log-form content-form toc-paste')[0];
const preview = (ui: Ui) => ui.find((n) => n.props['aria-label'] === '목차 미리보기')[0];
const saveButton = (ui: Ui) =>
  ui.find((n) => n.type === 'button' && n.props.type === 'submit', pasteForm(ui))[0];

uiTest('a pasted table of contents is previewed as a tree and saved at once (#23)', async () => {
  const api = fakeApi(outline);
  const ui = await openBook(api);
  await ui.click('목차 붙여넣기');
  assert.ok(pasteForm(ui), 'paste form');
  assert.equal(preview(ui), undefined, 'no preview before any text');
  assert.ok(saveButton(ui).props.disabled, 'nothing to save yet');

  await ui.fill('목차 텍스트', '3 고유값 ....... 120\n3.1 특성방정식  125\n3.2 대각화\n4 이차형식');
  assert.equal(shape(ui, preview(ui)), '3 고유값[3.1 특성방정식|3.2 대각화]|4 이차형식');
  assert.match(ui.text(preview(ui)), /미리보기 · 4개 \(기존 목차 뒤에 추가\)/);
  assert.equal(ui.text(saveButton(ui)), '4개 저장');

  // Fixing the text fixes the preview.
  await ui.fill('목차 텍스트', '3 고유값\n3.1 특성방정식\n4 이차형식');
  assert.equal(shape(ui, preview(ui)), '3 고유값[3.1 특성방정식]|4 이차형식');
  await ui.submit(pasteForm(ui));
  assert.deepEqual(api.requests.at(-1), {
    method: 'POST',
    path: '/api/textbooks/1/contents/bulk',
    body: {
      entries: [
        { level: 0, number: '3', title: '고유값' },
        { level: 1, number: '3.1', title: '특성방정식' },
        { level: 0, number: '4', title: '이차형식' },
      ],
    },
  });
  // The tree comes back with the save; no extra reload.
  assert.equal(api.requests.filter((r) => r.method === 'GET').length, 1);
  assert.equal(pasteForm(ui), undefined, 'the form closes');
  assert.equal(shape(ui), '1 벡터[1.1 덧셈|1.2 내적]|2 행렬|3 고유값[3.1 특성방정식]|4 이차형식');
  assert.match(ui.text(card(ui)), /목차 3개를 추가했습니다/);
});

uiTest('pasted text that cannot be saved says why and keeps the save locked', async () => {
  const api = fakeApi();
  const ui = await openBook(api);
  await ui.click('목차 붙여넣기');
  await ui.fill('목차 텍스트', `1 벡터\n2 ${'가'.repeat(201)}`);
  assert.match(
    ui.text(ui.find((n) => n.props.role === 'alert')[0]),
    /2번째 줄: 제목이 200자를 넘습니다/,
  );
  assert.ok(saveButton(ui).props.disabled);
  assert.doesNotMatch(
    ui.text(preview(ui)),
    /기존 목차 뒤에/,
    'an empty textbook has nothing before',
  );
  await ui.submit(pasteForm(ui));
  assert.equal(api.requests.filter((r) => r.method === 'POST').length, 0);
  // Cancelling closes the form; opening the chapter editor closes it too.
  await ui.click('취소', pasteForm(ui));
  assert.equal(pasteForm(ui), undefined);
  await ui.click('목차 붙여넣기');
  await ui.click('장 추가');
  assert.equal(pasteForm(ui), undefined);
});

uiTest('a refused paste shows the server message and keeps the text', async () => {
  const api = fakeApi([], { rejectBulk: { status: 400, error: '목차는 10단계까지입니다' } });
  const ui = await openBook(api);
  await ui.click('목차 붙여넣기');
  await ui.fill('목차 텍스트', '1 벡터');
  await ui.submit(pasteForm(ui));
  assert.match(ui.text(card(ui)), /목차는 10단계까지입니다/);
  assert.equal(ui.field('목차 텍스트'), '1 벡터');
});

// A stand-in for PDF.js: a document with the given bookmarks and page text, or a failure.
function fakePdfjs(doc: {
  outline: unknown[] | null;
  pages?: unknown[][];
  fail?: string;
  // The document opens only after this promise settles.
  hold?: Promise<void>;
}) {
  const seen = { opened: [] as number[], destroyed: 0 };
  const GlobalWorkerOptions: { workerSrc?: string } = {};
  const pdfjs = {
    __esModule: true,
    GlobalWorkerOptions,
    getDocument: ({ data }: { data: Uint8Array }) => {
      seen.opened.push(data.length);
      return {
        promise: (doc.hold ?? Promise.resolve()).then(() => {
          if (doc.fail) throw new Error(doc.fail);
          return {
            numPages: doc.pages?.length ?? 0,
            getOutline: async () => doc.outline,
            getPage: async (n: number) => ({
              getTextContent: async () => ({ items: doc.pages![n - 1] }),
            }),
          };
        }),
        destroy: async () => void seen.destroyed++,
      };
    },
  };
  const modules = {
    'pdfjs-dist': pdfjs,
    'pdfjs-dist/build/pdf.worker.min.mjs?url': { __esModule: true, default: '/pdf.worker.mjs' },
  };
  return { modules, seen, GlobalWorkerOptions };
}

const pdfFile = (size = 4) => ({ size, arrayBuffer: async () => new ArrayBuffer(size) });
const pickPdf = async (ui: Ui, file: unknown) => {
  const [input] = ui.find((n) => n.type === 'input' && n.props.type === 'file', pasteForm(ui));
  assert.ok(input, 'PDF picker');
  const target = { files: [file], value: 'C:\fakepath\book.pdf' };
  (input.props.onChange as (e: unknown) => void)({ target });
  assert.equal(target.value, '', 'cleared so the same file can be picked again');
  await ui.settle();
  await ui.settle();
};
const statusText = (ui: Ui) => ui.text(ui.find((n) => n.props.role === 'status', card(ui))[0]);
const alertText = (ui: Ui) => ui.text(ui.find((n) => n.props.role === 'alert', card(ui))[0]);

uiTest('a PDF with bookmarks fills the paste box with them, indented by level (#23)', async () => {
  const pdf = fakePdfjs({
    outline: [
      { title: '1 벡터', items: [{ title: '1.1 내적', items: [] }] },
      { title: '2 행렬', items: [] },
    ],
  });
  const ui = await openBook(fakeApi(), '선형대수', pdf.modules);
  await ui.click('목차 붙여넣기');
  await ui.fill('목차 텍스트', '지워질 글');
  await pickPdf(ui, pdfFile(4));
  assert.deepEqual(pdf.seen.opened, [4]);
  assert.equal(pdf.GlobalWorkerOptions.workerSrc, '/pdf.worker.mjs');
  assert.equal(pdf.seen.destroyed, 1, 'the document is closed after reading');
  assert.equal(ui.field('목차 텍스트'), '1 벡터\n  1.1 내적\n2 행렬');
  assert.equal(shape(ui, preview(ui)), '1 벡터[1.1 내적]|2 행렬');
  assert.match(statusText(ui), /PDF 책갈피에서 목차 3줄을 가져왔습니다/);
});

uiTest('a PDF without bookmarks gives the text of its first pages', async () => {
  const piece = (str: string, x: number, y: number) => ({
    str,
    transform: [10, 0, 0, 10, x, y],
    height: 10,
    width: str.length * 5,
  });
  const pdf = fakePdfjs({
    outline: null,
    pages: [[piece('목차', 50, 700)], [piece('1 벡터', 50, 700), piece('12', 300, 700)]],
  });
  const ui = await openBook(fakeApi(), '선형대수', pdf.modules);
  await ui.click('목차 붙여넣기');
  await pickPdf(ui, pdfFile());
  assert.equal(ui.field('목차 텍스트'), '목차\n1 벡터  12');
  assert.equal(shape(ui, preview(ui)), '1 벡터');
  assert.match(statusText(ui), /책갈피 목차가 없어 앞 2쪽의 글을 가져왔습니다/);
});

uiTest('an unreadable, empty or too large PDF says so and keeps the text', async () => {
  const broken = fakePdfjs({ outline: null, fail: 'Invalid PDF structure.' });
  let ui = await openBook(fakeApi(), '선형대수', broken.modules);
  await ui.click('목차 붙여넣기');
  await ui.fill('목차 텍스트', '1 벡터');
  await pickPdf(ui, pdfFile());
  assert.match(alertText(ui), /PDF를 읽지 못했습니다: Invalid PDF structure\./);
  assert.equal(broken.seen.destroyed, 1);
  assert.equal(ui.field('목차 텍스트'), '1 벡터');

  const scanned = fakePdfjs({ outline: [], pages: [[]] });
  ui = await openBook(fakeApi(), '선형대수', scanned.modules);
  await ui.click('목차 붙여넣기');
  await pickPdf(ui, pdfFile());
  assert.match(alertText(ui), /PDF에서 글을 찾지 못했습니다/);

  const big = fakePdfjs({ outline: [] });
  ui = await openBook(fakeApi(), '선형대수', big.modules);
  await ui.click('목차 붙여넣기');
  await pickPdf(ui, pdfFile(50 * 1024 * 1024 + 1));
  assert.match(alertText(ui), /50MB 이하/);
  assert.deepEqual(big.seen.opened, [], 'not read at all');
});

uiTest('a PDF still being read is dropped when the box is closed or an editor opens', async () => {
  let release = () => {};
  const hold = new Promise<void>((resolve) => (release = resolve));
  const pdf = fakePdfjs({ outline: [{ title: '1 벡터', items: [] }], hold });
  const ui = await openBook(fakeApi(outline), '선형대수', pdf.modules);
  await ui.click('목차 붙여넣기');
  await pickPdf(ui, pdfFile());
  // While reading: announced, and the box and save are locked.
  assert.match(statusText(ui), /PDF를 읽는 중/);
  assert.ok(
    ui.find((n) => n.type === 'textarea', pasteForm(ui))[0].props.disabled,
    'box locked while reading',
  );
  await ui.click('취소', pasteForm(ui));
  assert.equal(pasteForm(ui), undefined);
  assert.equal(statusText(ui), '', 'the reading notice goes with the box');
  release();
  await ui.settle();
  await ui.settle();
  assert.equal(pasteForm(ui), undefined, 'the late result does not reopen the box');
  assert.equal(statusText(ui), '');
  assert.equal(pdf.seen.destroyed, 1, 'the document is still closed');

  // Opening the chapter editor during a read keeps only the editor.
  let releaseAgain = () => {};
  const again = fakePdfjs({
    outline: [{ title: '2 행렬', items: [] }],
    hold: new Promise<void>((resolve) => (releaseAgain = resolve)),
  });
  const ui2 = await openBook(fakeApi(outline), '선형대수', again.modules);
  await ui2.click('목차 붙여넣기');
  await pickPdf(ui2, pdfFile());
  await ui2.click('장 추가');
  releaseAgain();
  await ui2.settle();
  await ui2.settle();
  assert.equal(pasteForm(ui2), undefined);
  assert.equal(ui2.find((n) => n.props.className === 'log-form content-form').length, 1);
  assert.doesNotMatch(statusText(ui2), /가져왔습니다/);
});
