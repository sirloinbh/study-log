import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendMissing, loadFrontendModule, mount, type FetchInit } from './ui-harness.js';

const uiTest = frontendMissing ? test.skip : test;

type Exercise = {
  id: number;
  textbookId: number;
  contentId: number;
  number: string;
  body: string;
  important: boolean;
};
type Tree = { id: number; number: string; title: string; children: Tree[] };

const books = [
  { id: 1, title: '선형대수', author: 'Strang', edition: '5판' },
  { id: 2, title: '미적분', author: '', edition: '' },
];
const contents: Record<number, Tree[]> = {
  1: [
    {
      id: 10,
      number: '1',
      title: '벡터',
      children: [{ id: 11, number: '1.2', title: '내적', children: [] }],
    },
    { id: 20, number: '2', title: '행렬', children: [] },
  ],
  2: [],
};

type Options = {
  // Every exercise request answers this error instead (after the list is first shown).
  reject?: { method: string; status: number; error: string };
  // Loading the contents tree fails.
  failContents?: boolean;
  // Changes (non-GET exercise requests) wait for this promise.
  holdChange?: Promise<void>;
};

// In-memory exercises API with the textbook list and contents; records exercise requests.
function fakeApi(initial: Exercise[] = [], options: Options = {}) {
  const rows = [...initial];
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
    if (path === '/api/textbooks') return reply(200, { textbooks: books });
    const tree = path.match(/^\/api\/textbooks\/(\d+)\/contents$/);
    if (tree)
      return options.failContents
        ? reply(500, { error: '서버 오류가 발생했습니다' })
        : reply(200, { contents: contents[Number(tree[1])] });
    requests.push({ method, path, body });
    if (method !== 'GET') await options.holdChange;
    if (options.reject?.method === method)
      return reply(options.reject.status, { error: options.reject.error });
    const list = path.match(/^\/api\/textbooks\/(\d+)\/contents\/(\d+)\/exercises$/);
    if (list) {
      const [textbookId, contentId] = [Number(list[1]), Number(list[2])];
      if (method === 'GET')
        return reply(200, {
          exercises: rows.filter((r) => r.textbookId === textbookId && r.contentId === contentId),
        });
      const row = { id: nextId++, textbookId, contentId, ...body };
      rows.push(row);
      return reply(201, { exercise: row });
    }
    const one = path.match(/^\/api\/exercises\/(\d+)$/);
    assert.ok(one, 'unexpected request ' + path);
    const index = rows.findIndex((r) => r.id === Number(one[1]));
    if (index < 0) return reply(404, { error: '연습문제를 찾을 수 없습니다' });
    if (method === 'PUT') {
      rows[index] = { ...rows[index], ...body };
      return reply(200, { exercise: rows[index] });
    }
    rows.splice(index, 1);
    return reply(204);
  };
  return { fetch, requests, rows };
}

const problems: Exercise[] = [
  { id: 1, textbookId: 1, contentId: 10, number: '3', body: '벡터 u를 구하라.', important: true },
  { id: 2, textbookId: 1, contentId: 10, number: '', body: '증명하라.', important: false },
  { id: 3, textbookId: 1, contentId: 11, number: '1', body: 'u·v =\n  1', important: false },
];

type Ui = ReturnType<typeof mount>;
const card = (ui: Ui) => ui.find((n) => n.props.className === 'exercises')[0];
const form = (ui: Ui) => ui.find((n) => n.props.className === 'log-form exercise-form')[0];
// Each exercise as "label:body", in list order.
const listed = (ui: Ui) =>
  ui
    .find((n) => n.type === 'li', card(ui))
    .map(
      (li) =>
        ui.text(ui.find((n) => n.props.className === 'log-date', li)[0]) +
        ':' +
        ui.text(ui.find((n) => n.props.className === 'exercise-body', li)[0]),
    );
const item = (ui: Ui, label: string) =>
  ui
    .find((n) => n.type === 'li', card(ui))
    .find((li) => ui.text(ui.find((n) => n.props.className === 'log-date', li)[0]) === label)!;
const alertText = (ui: Ui) => ui.text(ui.find((n) => n.props.role === 'alert', card(ui)));

// Opens the 교재 page and selects a textbook, with the clipboard given in `globals`.
async function openBook(
  api: ReturnType<typeof fakeApi>,
  title = '선형대수',
  globals: Record<string, unknown> = {},
) {
  const ui = mount(api.fetch, globals);
  await ui.settle();
  await ui.click('교재');
  await ui.click(title);
  return ui;
}

uiTest('the first chapter is picked and its exercises are listed in order', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  assert.equal(ui.field('단원'), 10);
  assert.deepEqual(listed(ui), ['문제 3:벡터 u를 구하라.', '2번째 문제:증명하라.']);
  // Only the important one has the badge.
  assert.deepEqual(
    ui.find((n) => n.props.className === 'badge important', card(ui)).map((n) => ui.text(n)),
    ['중요'],
  );
  // Picking a section lists its exercises, with line breaks kept in the body.
  await ui.fill('단원', '11');
  assert.deepEqual(listed(ui), ['문제 1:u·v =\n  1']);
  assert.deepEqual(
    api.requests.map((r) => r.path),
    ['/api/textbooks/1/contents/10/exercises', '/api/textbooks/1/contents/11/exercises'],
  );
  await ui.fill('단원', '20');
  assert.match(ui.text(card(ui)), /이 단원에 입력한 문제가 없습니다/);
});

uiTest('a textbook without contents asks for contents first', async () => {
  const ui = await openBook(fakeApi(), '미적분');
  assert.match(ui.text(card(ui)), /목차를 먼저 추가하면/);
  const [add] = ui.find((n) => n.type === 'button' && ui.text(n) === '문제 추가', card(ui));
  assert.equal(add.props.disabled, true);
});

uiTest('adding posts the exercise and keeps the form open for the next one', async () => {
  const api = fakeApi();
  const ui = await openBook(api);
  await ui.click('문제 추가', card(ui));
  await ui.fill('문제 번호', '5');
  await ui.fill('문제 본문', '행렬 A의\n역행렬을 구하라.');
  const [check] = ui.find((n) => n.props.type === 'checkbox', form(ui));
  (check.props.onChange as (e: { target: { checked: boolean } }) => void)({
    target: { checked: true },
  });
  await ui.settle();
  await ui.submit(form(ui));
  assert.deepEqual(api.requests.at(-2), {
    method: 'POST',
    path: '/api/textbooks/1/contents/10/exercises',
    body: { number: '5', body: '행렬 A의\n역행렬을 구하라.', important: true },
  });
  assert.deepEqual(listed(ui), ['문제 5:행렬 A의\n역행렬을 구하라.']);
  assert.match(ui.text(card(ui)), /추가했습니다/);
  // Still open and empty for the next exercise.
  assert.equal(ui.field('문제 번호'), '');
  assert.equal(ui.field('문제 본문'), '');
});

uiTest('the body takes focus when the form opens and again after each add', async () => {
  const focused: string[] = [];
  const document = { getElementById: (id: string) => ({ focus: () => focused.push(id) }) };
  const ui = await openBook(fakeApi(), '선형대수', { document });
  await ui.click('문제 추가', card(ui));
  assert.deepEqual(focused, ['exercise-body']);
  await ui.fill('문제 본문', '첫 문제');
  await ui.submit(form(ui));
  // Once the save and the reload are done and the field is enabled again.
  assert.deepEqual(focused, ['exercise-body', 'exercise-body']);
});

uiTest('deleting another exercise leaves focus where it is', async () => {
  const focused: string[] = [];
  const document = { getElementById: (id: string) => ({ focus: () => focused.push(id) }) };
  const ui = await openBook(fakeApi(problems), '선형대수', { document });
  await ui.click('수정', item(ui, '문제 3'));
  assert.equal(focused.length, 1);
  await ui.click('삭제', item(ui, '2번째 문제'));
  await ui.click('삭제 확인', item(ui, '2번째 문제'));
  assert.deepEqual(listed(ui), ['문제 3:벡터 u를 구하라.']);
  assert.equal(focused.length, 1);
  // The edit stays open with its input.
  assert.equal(ui.field('문제 본문'), '벡터 u를 구하라.');
});

uiTest('a failed contents load says the chapters cannot be picked', async () => {
  const ui = await openBook(fakeApi([], { failContents: true }));
  assert.match(ui.text(card(ui)), /목차를 불러오지 못해 단원을 고를 수 없습니다/);
  assert.doesNotMatch(ui.text(card(ui)), /불러오는 중/);
});

uiTest('switching textbooks shows nothing of the previous one', async () => {
  const ui = await openBook(fakeApi(problems));
  await ui.click('문제 추가', card(ui));
  await ui.fill('문제 본문', '쓰던 문제');
  await ui.click('미적분');
  assert.equal(form(ui), undefined);
  assert.deepEqual(listed(ui), []);
  assert.match(ui.text(card(ui)), /목차를 먼저 추가하면/);
});

uiTest('picking another chapter hides the open form until coming back', async () => {
  const ui = await openBook(fakeApi(problems));
  await ui.click('문제 추가', card(ui));
  await ui.fill('문제 본문', '쓰던 문제');
  await ui.fill('단원', '11');
  assert.equal(form(ui), undefined);
  assert.deepEqual(listed(ui), ['문제 1:u·v =\n  1']);
  await ui.fill('단원', '10');
  assert.equal(ui.field('문제 본문'), '쓰던 문제');
});

uiTest('buttons and the chapter picker are locked while a change is pending', async () => {
  let release = () => {};
  const api = fakeApi(problems, { holdChange: new Promise<void>((r) => (release = r)) });
  const ui = await openBook(api);
  await ui.click('삭제', item(ui, '문제 3'));
  await ui.click('삭제 확인', item(ui, '문제 3'));
  const controls = ui.find((n) => n.type === 'button' || n.type === 'select', card(ui));
  const copies = controls.filter((n) => ui.text(n) === '질문 복사');
  const others = controls.filter((n) => ui.text(n) !== '질문 복사');
  assert.ok(others.length > 0 && others.every((n) => n.props.disabled), 'locked while pending');
  // Copying only reads, so it stays available.
  assert.ok(copies.length > 0 && copies.every((n) => !n.props.disabled));
  release();
  await ui.settle();
  assert.deepEqual(listed(ui), ['1번째 문제:증명하라.']);
});

uiTest('deleting an exercise already gone reports it and reloads', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  await ui.click('삭제', item(ui, '문제 3'));
  api.rows.splice(0, 1);
  await ui.click('삭제 확인', item(ui, '문제 3'));
  assert.match(alertText(ui), /연습문제를 찾을 수 없습니다/);
  assert.deepEqual(listed(ui), ['1번째 문제:증명하라.']);
});

uiTest('editing replaces the exercise with PUT and closes the form', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  await ui.click('수정', item(ui, '문제 3'));
  assert.equal(ui.field('문제 본문'), '벡터 u를 구하라.');
  await ui.fill('문제 본문', '벡터 u의 길이를 구하라.');
  await ui.submit(form(ui));
  assert.deepEqual(
    api.requests.find((r) => r.method === 'PUT'),
    {
      method: 'PUT',
      path: '/api/exercises/1',
      body: { number: '3', body: '벡터 u의 길이를 구하라.', important: true },
    },
  );
  assert.equal(form(ui), undefined);
  assert.deepEqual(listed(ui)[0], '문제 3:벡터 u의 길이를 구하라.');
  assert.match(ui.text(card(ui)), /수정했습니다/);
});

uiTest('deleting needs a confirmation', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  await ui.click('삭제', item(ui, '문제 3'));
  await ui.click('취소', item(ui, '문제 3'));
  assert.equal(api.requests.filter((r) => r.method === 'DELETE').length, 0);
  await ui.click('삭제', item(ui, '문제 3'));
  await ui.click('삭제 확인', item(ui, '문제 3'));
  assert.deepEqual(
    api.requests.filter((r) => r.method === 'DELETE').map((r) => r.path),
    ['/api/exercises/1'],
  );
  assert.deepEqual(listed(ui), ['1번째 문제:증명하라.']);
  assert.match(ui.text(card(ui)), /삭제했습니다/);
});

uiTest('a refused save shows the server message and keeps the input', async () => {
  const api = fakeApi([], {
    reject: { method: 'POST', status: 400, error: '문제 본문을 입력하세요' },
  });
  const ui = await openBook(api);
  await ui.click('문제 추가', card(ui));
  await ui.fill('문제 번호', '7');
  await ui.fill('문제 본문', '   ');
  await ui.submit(form(ui));
  assert.match(alertText(ui), /문제 본문을 입력하세요/);
  assert.equal(ui.field('문제 번호'), '7');
});

uiTest('saving an edit of an exercise deleted elsewhere closes the form', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  await ui.click('수정', item(ui, '문제 3'));
  api.rows.splice(0, 1);
  await ui.submit(form(ui));
  assert.match(alertText(ui), /연습문제를 찾을 수 없습니다/);
  assert.equal(form(ui), undefined);
  assert.deepEqual(listed(ui), ['1번째 문제:증명하라.']);
});

uiTest('copy writes the question with textbook, chapter path and number', async () => {
  const copied: string[] = [];
  const clipboard = { writeText: async (text: string) => void copied.push(text) };
  const ui = await openBook(fakeApi(problems), '선형대수', { navigator: { clipboard } });
  await ui.fill('단원', '11');
  await ui.click('질문 복사', item(ui, '문제 1'));
  assert.deepEqual(copied, [
    [
      '교재: 선형대수 (Strang · 5판)',
      '단원: 1 벡터 > 1.2 내적',
      '문제 번호: 1',
      '',
      'u·v =\n  1',
      '',
      '이 연습문제의 풀이를 단계별로 설명해 주세요. 필요한 개념도 함께 알려 주세요.',
    ].join('\n'),
  ]);
  assert.match(ui.text(card(ui)), /문제 1 질문을 복사했습니다/);
});

uiTest('a failed copy says to copy the body by hand', async () => {
  const refused = {
    writeText: async () => {
      throw new Error('NotAllowedError');
    },
  };
  for (const globals of [{}, { navigator: { clipboard: refused } }]) {
    const ui = await openBook(fakeApi(problems), '선형대수', globals);
    await ui.click('질문 복사', item(ui, '문제 3'));
    assert.match(alertText(ui), /클립보드에 복사하지 못했습니다/);
  }
});

uiTest('a chapter added in the contents card can be picked right away', async () => {
  const api = fakeApi();
  const ui = await openBook(api);
  contents[1].push({ id: 30, number: '3', title: '행렬식', children: [] });
  try {
    // Any change in the contents card reloads the tree; adding is the usual one.
    await ui.click('장 추가');
    await ui.fill('목차 제목', '행렬식');
    await ui.submit(ui.find((n) => n.props.className === 'log-form content-form')[0]);
    const picker = ui.find((n) => n.type === 'select', card(ui))[0];
    assert.deepEqual(
      ui.find((n) => n.type === 'option', picker).map((n) => n.props.value),
      [10, 11, 20, 30],
    );
  } finally {
    contents[1].pop();
  }
});

uiTest('exercise buttons name the exercise they act on', async () => {
  const ui = await openBook(fakeApi([problems[1]]));
  const labels = ui
    .find((n) => n.type === 'button' && typeof n.props['aria-label'] === 'string', card(ui))
    .map((n) => n.props['aria-label']);
  assert.deepEqual(labels, ['1번째 문제 질문 복사', '1번째 문제 수정', '1번째 문제 삭제']);
});

uiTest('the question leaves out a blank number and blank lines around the body', () => {
  const logic = loadFrontendModule<{
    questionText(
      book: { title: string; author: string; edition: string },
      path: { number: string; title: string }[],
      exercise: { number: string; body: string },
    ): string;
    contentPath(nodes: Tree[], id: number): Tree[] | undefined;
  }>('exercise.ts');
  assert.equal(
    logic.questionText(
      { title: '미적분', author: '', edition: '' },
      [{ number: '', title: '극한' }],
      {
        number: ' ',
        body: '\n\n  x → 0 일 때\n\n',
      },
    ),
    '교재: 미적분\n단원: 극한\n\n  x → 0 일 때\n\n이 연습문제의 풀이를 단계별로 설명해 주세요. 필요한 개념도 함께 알려 주세요.',
  );
  // Array.from copies out of the module's realm, which deepEqual would otherwise reject.
  assert.deepEqual(
    Array.from(logic.contentPath(contents[1], 11) ?? [], (node) => node.id),
    [10, 11],
  );
  assert.equal(logic.contentPath(contents[1], 99), undefined);
});
