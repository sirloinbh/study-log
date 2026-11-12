import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type FetchInit, frontendMissing, loadFrontendModule, mount } from './ui-harness.js';

const uiTest = frontendMissing ? test.skip : test;

type Book = { id: number; title: string; author: string; edition: string };

type Options = {
  // Every write answers this error.
  reject?: { status: number; error: string };
  // Which list loads fail (1-based count of GETs); a failing load answers 500.
  failGet?: (count: number) => boolean;
  // When set, writes wait for this promise before answering.
  hold?: Promise<void>;
};

// In-memory stand-in for /api/textbooks that records every request the screen sends.
function fakeApi(initial: Book[] = [], options: Options = {}) {
  const { reject, failGet, hold } = options;
  let gets = 0;
  const books = [...initial];
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
    if (path === '/api/health') return reply(200, { ok: true, today: '2026-10-22' });
    if (path.startsWith('/api/study-logs')) return reply(200, { studyLogs: [] });
    // The selected textbook's contents card (tested in textbook-contents-ui.test.ts).
    if (path.endsWith('/contents')) return reply(200, { contents: [] });
    requests.push({ method, path, body });
    if (reject && method !== 'GET') return reply(reject.status, { error: reject.error });
    if (method === 'GET') {
      if (failGet?.(++gets)) return reply(500, { error: 'Server error' });
      const sorted = [...books].sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id);
      return reply(200, { textbooks: sorted });
    }
    await hold;
    if (method === 'POST') {
      const book = { id: nextId++, ...body };
      books.push(book);
      return reply(201, { textbook: book });
    }
    const id = Number(path.split('/')[3]);
    const index = books.findIndex((book) => book.id === id);
    if (index < 0) return reply(404, { error: 'Textbook not found' });
    if (method === 'PUT') {
      books[index] = { id, ...body };
      return reply(200, { textbook: books[index] });
    }
    books.splice(index, 1);
    return reply(204);
  };
  return { fetch, requests, books };
}

const linear: Book = {
  id: 1,
  title: '선형대수와 그 응용',
  author: 'Gilbert Strang',
  edition: '4판',
};
const calculus: Book = { id: 2, title: '미적분학', author: '', edition: '' };

// Opens the app on the Textbooks page.
async function open(
  api: { fetch: Parameters<typeof mount>[0]; requests: unknown[] },
  globals = {},
) {
  const ui = mount(api.fetch, globals);
  await ui.settle();
  // The study log page that opens first also loads textbooks; count only this page's requests.
  api.requests.length = 0;
  await ui.click('Textbook');
  return ui;
}

const items = (ui: ReturnType<typeof mount>) => ui.find((n) => n.type === 'li');
const detail = (ui: ReturnType<typeof mount>) =>
  ui.find((n) => n.props.id === 'textbook-detail')[0];
const heading = (ui: ReturnType<typeof mount>) => ui.text(ui.find((n) => n.type === 'h2')[0]);

uiTest('the textbook page lists titles with author and edition', async () => {
  const api = fakeApi([linear, calculus]);
  const ui = await open(api);
  assert.match(ui.text(ui.find((n) => n.type === 'h1')), /Textbook/);
  assert.deepEqual(api.requests, [{ method: 'GET', path: '/api/textbooks', body: undefined }]);
  const lines = items(ui).map((item) => ui.text(item));
  // Server order (by title); a blank author and edition show nothing extra.
  assert.deepEqual(lines, ['미적분학', '선형대수와 그 응용Gilbert Strang · 4판']);
  assert.match(ui.text(detail(ui)), /Choose a textbook from the list/);
});

uiTest('an empty textbook list says so', async () => {
  const ui = await open(fakeApi());
  assert.match(ui.text(), /No textbooks registered yet/);
  assert.equal(items(ui).length, 0);
});

uiTest('registering a textbook posts it, clears the form and shows its detail', async () => {
  const api = fakeApi();
  const ui = await open(api);
  assert.equal(heading(ui), 'Register a textbook');
  await ui.fill('Title', '확률과 통계');
  await ui.fill('Author', '홍길동');
  await ui.fill('Edition', '2판');
  await ui.submit();

  assert.deepEqual(api.requests[1], {
    method: 'POST',
    path: '/api/textbooks',
    body: { title: '확률과 통계', author: '홍길동', edition: '2판' },
  });
  // The list is reloaded from the server after saving.
  assert.equal(api.requests[2].method, 'GET');
  assert.match(ui.text(items(ui)[0]), /확률과 통계홍길동 · 2판/);
  assert.match(ui.text(ui.find((n) => n.props.role === 'status')), /Registered/);
  assert.equal(ui.field('Title'), '');
  assert.equal(ui.field('Author'), '');
  assert.equal(ui.field('Edition'), '');
  assert.match(ui.text(detail(ui)), /Title확률과 통계Author홍길동Edition2판/);
});

uiTest('a rejected save shows the server message and keeps the input', async () => {
  const api = fakeApi([], { reject: { status: 400, error: 'Enter the title' } });
  const ui = await open(api);
  await ui.fill('Title', '   ');
  await ui.fill('Author', '홍길동');
  await ui.submit();
  assert.match(ui.text(ui.find((n) => n.props.role === 'alert')), /Enter the title/);
  assert.equal(ui.field('Author'), '홍길동');
});

uiTest('selecting a textbook shows its detail with blanks marked', async () => {
  const ui = await open(fakeApi([linear, calculus]));
  await ui.click('미적분학');
  assert.match(ui.text(detail(ui)), /Title미적분학Author—Edition—/);
  const [current] = ui.find((n) => n.props['aria-current'] === 'true');
  assert.equal(ui.text(current), '미적분학');
  await ui.click('선형대수와 그 응용');
  assert.match(ui.text(detail(ui)), /AuthorGilbert StrangEdition4판/);
});

uiTest('editing from the detail fills the form and saves it with PUT', async () => {
  const api = fakeApi([linear]);
  const ui = await open(api);
  await ui.click('선형대수와 그 응용');
  await ui.click('Edit', detail(ui));
  assert.equal(heading(ui), 'Edit the textbook');
  assert.equal(ui.field('Title'), '선형대수와 그 응용');
  assert.equal(ui.field('Author'), 'Gilbert Strang');
  await ui.fill('Edition', '5판');
  await ui.submit();

  assert.deepEqual(
    api.requests.find((request) => request.method === 'PUT'),
    {
      method: 'PUT',
      path: '/api/textbooks/1',
      body: { title: '선형대수와 그 응용', author: 'Gilbert Strang', edition: '5판' },
    },
  );
  assert.match(ui.text(ui.find((n) => n.props.role === 'status')), /Updated/);
  assert.match(ui.text(items(ui)[0]), /Gilbert Strang · 5판/);
  assert.match(ui.text(detail(ui)), /Edition5판/);
  assert.equal(heading(ui), 'Register a textbook');
  assert.equal(ui.field('Title'), '');
});

uiTest('cancelling an edit restores the unsaved new textbook', async () => {
  const ui = await open(fakeApi([linear]));
  await ui.fill('Title', '작성 중인 교재');
  await ui.click('선형대수와 그 응용');
  await ui.click('Edit', detail(ui));
  assert.equal(ui.field('Title'), '선형대수와 그 응용');
  await ui.click('Cancel', ui.find((n) => n.type === 'form')[0]);
  assert.equal(heading(ui), 'Register a textbook');
  assert.equal(ui.field('Title'), '작성 중인 교재');
});

uiTest('deleting needs a second click and can be cancelled', async () => {
  const api = fakeApi([linear]);
  const ui = await open(api);
  await ui.click('선형대수와 그 응용');
  await ui.click('Delete', detail(ui));
  await ui.click('Cancel', detail(ui));
  assert.equal(api.requests.filter((request) => request.method === 'DELETE').length, 0);

  await ui.click('Delete', detail(ui));
  assert.equal(api.requests.filter((request) => request.method === 'DELETE').length, 0);
  await ui.click('Confirm delete');
  assert.deepEqual(
    api.requests.filter((request) => request.method === 'DELETE').map((request) => request.path),
    ['/api/textbooks/1'],
  );
  assert.equal(items(ui).length, 0);
  assert.match(ui.text(), /Deleted/);
  assert.match(ui.text(detail(ui)), /Choose a textbook from the list/);
});

uiTest('deleting the textbook being edited ends the edit', async () => {
  const ui = await open(fakeApi([linear]));
  await ui.click('선형대수와 그 응용');
  await ui.click('Edit', detail(ui));
  await ui.click('Delete', detail(ui));
  await ui.click('Confirm delete');
  assert.equal(heading(ui), 'Register a textbook');
  assert.equal(ui.field('Title'), '');
});

uiTest('saving an edit of a textbook deleted elsewhere leaves edit mode and reloads', async () => {
  const api = fakeApi([linear]);
  const ui = await open(api);
  await ui.click('선형대수와 그 응용');
  await ui.click('Edit', detail(ui));
  api.books.splice(0, 1);
  await ui.submit();
  assert.match(ui.text(ui.find((n) => n.props.role === 'alert')), /Textbook not found/);
  assert.equal(heading(ui), 'Register a textbook');
  assert.equal(items(ui).length, 0);
  // The detail no longer shows the textbook that is gone.
  assert.match(ui.text(detail(ui)), /Choose a textbook from the list/);
});

uiTest('a failed load reports the error instead of claiming there are no textbooks', async () => {
  const ui = await open(fakeApi([linear], { failGet: () => true }));
  assert.match(
    ui.text(ui.find((n) => n.props.role === 'alert')),
    /Could not load the textbooks: Server error/,
  );
  assert.doesNotMatch(ui.text(), /No textbooks registered yet/);
});

uiTest('fields and buttons are locked while a save is in flight', async () => {
  let release = () => {};
  const api = fakeApi([linear], { hold: new Promise<void>((r) => (release = r)) });
  const ui = await open(api);
  await ui.click('선형대수와 그 응용');
  await ui.fill('Title', '새 교재');
  await ui.submit();
  const inputs = ui.find((n) => n.type === 'input').map((n) => n.props.disabled);
  assert.deepEqual(inputs, [true, true, true]);
  const actions = ui
    .find((n) => n.type === 'button')
    .filter((n) => ['Register', 'Edit', 'Delete'].includes(ui.text(n)))
    .map((n) => n.props.disabled);
  assert.deepEqual(actions, [true, true, true]);
  release();
  await ui.settle();
  assert.equal(api.requests.filter((request) => request.method === 'POST').length, 1);
  assert.match(ui.text(ui.find((n) => n.props.role === 'status')), /Registered/);
});

uiTest('detail buttons name the textbook they act on', async () => {
  const ui = await open(fakeApi([linear]));
  await ui.click('선형대수와 그 응용');
  const labels = ui
    .find((n) => n.type === 'button' && typeof n.props['aria-label'] === 'string')
    .map((n) => n.props['aria-label']);
  assert.deepEqual(labels, [
    '선형대수와 그 응용 textbook edit',
    '선형대수와 그 응용 textbook delete',
  ]);
});

uiTest('leaving a page and coming back starts it fresh', async () => {
  const ui = mount(fakeApi([linear]).fetch);
  await ui.settle();
  await ui.fill('Start', '08:00');
  await ui.click('Textbook');
  // The textbook form does not inherit the study log form's state.
  assert.equal(ui.field('Title'), '');
  await ui.fill('Title', '작성 중');
  await ui.click('Study log');
  assert.equal(ui.field('Start'), '');
  await ui.click('Textbook');
  assert.equal(ui.field('Title'), '');
});

uiTest('selecting moves focus to the detail only when it is stacked below the list', async () => {
  for (const [narrow, expected] of [
    [false, []],
    [true, ['textbook-detail']],
  ] as const) {
    const focused: string[] = [];
    const ui = await open(fakeApi([linear]), {
      document: { getElementById: (id: string) => ({ focus: () => focused.push(id) }) },
      matchMedia: (query: string) => ({ matches: narrow && query === '(max-width: 760px)' }),
    });
    await ui.click('선형대수와 그 응용');
    assert.deepEqual(focused, expected, narrow ? 'phone width' : 'desktop width');
  }
});

uiTest('a 404 when deleting reports it, reloads and clears the detail', async () => {
  const api = fakeApi([linear]);
  const ui = await open(api);
  await ui.click('선형대수와 그 응용');
  await ui.click('Delete', detail(ui));
  // The textbook disappears on the server before the delete is confirmed here.
  api.books.splice(0, 1);
  await ui.click('Confirm delete');
  assert.match(ui.text(ui.find((n) => n.props.role === 'alert')), /Textbook not found/);
  assert.equal(items(ui).length, 0);
  assert.match(ui.text(detail(ui)), /Choose a textbook from the list/);
});

uiTest('textbook meta joins author and edition and skips blanks', () => {
  const logic = loadFrontendModule<{
    textbookMeta(book: { title: string; author: string; edition: string }): string;
  }>('textbook.ts');
  const book = { title: 't', author: 'Author', edition: '3판' };
  assert.equal(logic.textbookMeta(book), 'Author · 3판');
  assert.equal(logic.textbookMeta({ ...book, edition: '' }), 'Author');
  assert.equal(logic.textbookMeta({ ...book, author: ' ' }), '3판');
  assert.equal(logic.textbookMeta({ ...book, author: '', edition: '' }), '');
});

// #65: the focused delete button is swapped out at each step; focus follows the flow instead of
// dropping to the page.
// Records focused ids. Set `state.ui` to the mounted UI, so an id with no element in the
// rendered tree (a typo) fails instead of being focused.
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

uiTest('focus follows the delete flow: confirm, back on cancel, the list after', async () => {
  const { focused, document, state } = focusRecorder();
  const ui = await open(fakeApi([linear]), { document });
  state.ui = ui;
  await ui.click('선형대수와 그 응용');
  await ui.click('Delete', detail(ui));
  assert.equal(focused.at(-1), 'textbook-delete-confirm');
  await ui.click('Cancel', detail(ui));
  assert.equal(focused.at(-1), 'textbook-delete');
  await ui.click('Delete', detail(ui));
  await ui.click('Confirm delete', detail(ui));
  assert.equal(focused.at(-1), 'textbook-list');
  const [heading] = ui.find((n) => n.props.id === 'textbook-list');
  assert.equal(heading.props.tabIndex, -1);
});

uiTest('a failed textbook delete puts focus back on delete, a 404 on the list', async () => {
  for (const [reject, target] of [
    [{ status: 500, error: 'Server error' }, 'textbook-delete'],
    [{ status: 404, error: 'Textbook not found' }, 'textbook-list'],
  ] as const) {
    const { focused, document, state } = focusRecorder();
    const ui = await open(fakeApi([linear], { reject }), { document });
    state.ui = ui;
    await ui.click('선형대수와 그 응용');
    await ui.click('Delete', detail(ui));
    await ui.click('Confirm delete', detail(ui));
    assert.equal(focused.at(-1), target, String(reject.status));
  }
});

// #75: two submits in the same tick, before the screen re-renders with `busy`, send one request.
uiTest('a double submit in the same tick registers the textbook once', async () => {
  const api = fakeApi();
  const ui = await open(api);
  await ui.fill('Title', '확률과 통계');
  const [form] = ui.find((n) => n.type === 'form');
  const onSubmit = form.props.onSubmit as (event: { preventDefault(): void }) => unknown;
  void onSubmit({ preventDefault() {} });
  void onSubmit({ preventDefault() {} });
  await ui.settle();
  assert.equal(api.requests.filter((r) => r.method === 'POST').length, 1);
  assert.equal(items(ui).length, 1);
});
