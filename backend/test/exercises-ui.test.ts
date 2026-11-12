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
  // Loading the important card fails.
  failImportant?: boolean;
  // Translations already made (#31), by exercise id.
  translations?: Record<number, Translation>;
  // Translating answers this error instead.
  failTranslate?: { status: number; error: string };
};

type Translation = {
  body: string;
  answer: string | null;
  model: string;
  updatedAt: string;
  stale: boolean;
};

// In-memory exercises API with the textbook list and contents; records exercise requests.
function fakeApi(
  initial: Exercise[] = [],
  options: Options = {},
  initialAnswers: Record<number, string> = {},
) {
  // Copies, so a change in one test never reaches the shared fixtures.
  const rows = initial.map((row) => ({ ...row }));
  const answers = new Map(Object.entries(initialAnswers).map(([id, body]) => [Number(id), body]));
  const translations = new Map(
    Object.entries(options.translations ?? {}).map(([id, t]) => [Number(id), { ...t }]),
  );
  const requests: { method: string; path: string; body?: unknown }[] = [];
  // Loads of the important card, kept apart so `requests` stays the exercises card's.
  const importantLoads: string[] = [];
  // How many times the contents tree was loaded.
  let treeLoads = 0;
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
    if (tree) treeLoads++;
    if (tree)
      return options.failContents
        ? reply(500, { error: 'Server error' })
        : // A copy, as from the server: a chapter removed later stays in the tree on screen.
          reply(200, { contents: structuredClone(contents[Number(tree[1])]) });
    const across = path.match(/^\/api\/textbooks\/(\d+)\/exercises\?(.*)$/);
    if (across) {
      importantLoads.push(path);
      if (options.failImportant) return reply(500, { error: 'Server error' });
      const query = new URLSearchParams(across[2]);
      // The picked chapter and its sections, in contents order.
      const flat = (nodes: Tree[]): Tree[] => nodes.flatMap((n) => [n, ...flat(n.children)]);
      const all = flat(contents[Number(across[1])]);
      const top = query.get('contentId');
      const scope = top ? flat([all.find((n) => n.id === Number(top))!]) : all;
      return reply(200, {
        exercises: scope.flatMap((node) =>
          rows.filter(
            (r) => r.contentId === node.id && (query.get('important') !== 'true' || r.important),
          ),
        ),
      });
    }
    requests.push({ method, path, body });
    if (method !== 'GET') await options.holdChange;
    if (options.reject?.method === method)
      return reply(options.reject.status, { error: options.reject.error });
    const list = path.match(/^\/api\/textbooks\/(\d+)\/contents\/(\d+)\/exercises$/);
    if (list) {
      const [textbookId, contentId] = [Number(list[1]), Number(list[2])];
      // A chapter no longer in the contents (deleted elsewhere) is a 404, as from the API.
      const nodes = (all: Tree[]): Tree[] => all.flatMap((n) => [n, ...nodes(n.children)]);
      if (!nodes(contents[textbookId]).some((n) => n.id === contentId))
        return reply(404, { error: 'Contents entry not found' });
      if (method === 'GET')
        return reply(200, {
          exercises: rows.filter((r) => r.textbookId === textbookId && r.contentId === contentId),
        });
      const row = { id: nextId++, textbookId, contentId, ...body };
      rows.push(row);
      return reply(201, { exercise: row });
    }
    const ofAnswer = path.match(/^\/api\/exercises\/(\d+)\/answer$/);
    if (ofAnswer) {
      const id = Number(ofAnswer[1]);
      if (!rows.some((r) => r.id === id)) return reply(404, { error: 'Exercise not found' });
      if (method === 'PUT') answers.set(id, body.body);
      if (method === 'DELETE') {
        if (!answers.delete(id)) return reply(404, { error: 'Answer not found' });
        return reply(204);
      }
      const saved = answers.get(id);
      return reply(200, { answer: saved === undefined ? null : { exerciseId: id, body: saved } });
    }
    // Like the API with a stand-in translator: "Translation: " before each text.
    const ofTranslation = path.match(/^\/api\/exercises\/(\d+)\/translation$/);
    if (ofTranslation) {
      const id = Number(ofTranslation[1]);
      const row = rows.find((r) => r.id === id);
      if (!row) return reply(404, { error: 'Exercise not found' });
      if (method === 'POST') {
        if (options.failTranslate)
          return reply(options.failTranslate.status, { error: options.failTranslate.error });
        const answer = answers.get(id);
        translations.set(id, {
          body: `Translation: ${row.body}`,
          answer: answer === undefined ? null : `Translation: ${answer}`,
          model: 'claude-sonnet-5-5',
          updatedAt: '2026-10-23 17:00',
          stale: false,
        });
      }
      return reply(200, { translation: translations.get(id) ?? null });
    }
    const mark = path.match(/^\/api\/exercises\/(\d+)\/important$/);
    if (mark) {
      const row = rows.find((r) => r.id === Number(mark[1]));
      if (!row) return reply(404, { error: 'Exercise not found' });
      row.important = body.important;
      return reply(200, { exercise: row });
    }
    const one = path.match(/^\/api\/exercises\/(\d+)$/);
    assert.ok(one, 'unexpected request ' + path);
    const index = rows.findIndex((r) => r.id === Number(one[1]));
    if (index < 0) return reply(404, { error: 'Exercise not found' });
    if (method === 'PUT') {
      rows[index] = { ...rows[index], ...body };
      return reply(200, { exercise: rows[index] });
    }
    rows.splice(index, 1);
    return reply(204);
  };
  return { fetch, requests, rows, answers, importantLoads, treeLoads: () => treeLoads };
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

// Opens the Textbooks page and selects a textbook, with the clipboard given in `globals`.
async function openBook(
  api: ReturnType<typeof fakeApi>,
  title = '선형대수',
  globals: Record<string, unknown> = {},
) {
  const ui = mount(api.fetch, globals);
  await ui.settle();
  await ui.click('Textbook');
  await ui.click(title);
  return ui;
}

uiTest('the first chapter is picked and its exercises are listed in order', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  assert.equal(ui.field('Section'), 10);
  assert.deepEqual(listed(ui), ['Problem 3:벡터 u를 구하라.', 'Problem #2:증명하라.']);
  // Only the important one has the badge.
  assert.deepEqual(
    ui.find((n) => n.props.className === 'badge important', card(ui)).map((n) => ui.text(n)),
    ['Important'],
  );
  // Picking a section lists its exercises, with line breaks kept in the body.
  await ui.fill('Section', '11');
  assert.deepEqual(listed(ui), ['Problem 1:u·v =\n  1']);
  assert.deepEqual(
    api.requests.map((r) => r.path),
    ['/api/textbooks/1/contents/10/exercises', '/api/textbooks/1/contents/11/exercises'],
  );
  await ui.fill('Section', '20');
  assert.match(ui.text(card(ui)), /No problems entered for this section/);
});

uiTest('a textbook without contents asks for contents first', async () => {
  const ui = await openBook(fakeApi(), '미적분');
  assert.match(ui.text(card(ui)), /Add contents first/);
  const [add] = ui.find((n) => n.type === 'button' && ui.text(n) === 'Add problem', card(ui));
  assert.equal(add.props.disabled, true);
});

uiTest('adding posts the exercise and keeps the form open for the next one', async () => {
  const api = fakeApi();
  const ui = await openBook(api);
  await ui.click('Add problem', card(ui));
  await ui.fill('Problem number', '5');
  await ui.fill('Problem text', '행렬 A의\n역행렬을 구하라.');
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
  assert.deepEqual(listed(ui), ['Problem 5:행렬 A의\n역행렬을 구하라.']);
  assert.match(ui.text(card(ui)), /Added/);
  // Still open and empty for the next exercise.
  assert.equal(ui.field('Problem number'), '');
  assert.equal(ui.field('Problem text'), '');
});

uiTest('the body takes focus when the form opens and again after each add', async () => {
  const focused: string[] = [];
  const document = { getElementById: (id: string) => ({ focus: () => focused.push(id) }) };
  const ui = await openBook(fakeApi(), '선형대수', { document });
  await ui.click('Add problem', card(ui));
  assert.deepEqual(focused, ['exercise-body']);
  await ui.fill('Problem text', '첫 문제');
  await ui.submit(form(ui));
  // Once the save and the reload are done and the field is enabled again.
  assert.deepEqual(focused, ['exercise-body', 'exercise-body']);
});

uiTest('deleting another exercise keeps the edit open and focus follows the delete', async () => {
  const focused: string[] = [];
  const document = { getElementById: (id: string) => ({ focus: () => focused.push(id) }) };
  const ui = await openBook(fakeApi(problems), '선형대수', { document });
  await ui.click('Edit', item(ui, 'Problem 3'));
  assert.deepEqual(focused, ['exercise-body']);
  await ui.click('Delete', item(ui, 'Problem #2'));
  await ui.click('Confirm delete', item(ui, 'Problem #2'));
  assert.deepEqual(listed(ui), ['Problem 3:벡터 u를 구하라.']);
  // The confirm button, then the card heading once the exercise is gone (#86).
  assert.deepEqual(focused, ['exercise-body', 'exercise-delete-confirm-2', 'exercise-heading']);
  // The edit stays open with its input.
  assert.equal(ui.field('Problem text'), '벡터 u를 구하라.');
});

uiTest('a failed contents load says the chapters cannot be picked', async () => {
  const ui = await openBook(fakeApi([], { failContents: true }));
  assert.match(ui.text(card(ui)), /Could not load the contents, so a section cannot be chosen/);
  assert.doesNotMatch(ui.text(card(ui)), /Loading/);
});

uiTest('switching textbooks shows nothing of the previous one', async () => {
  const ui = await openBook(fakeApi(problems));
  await ui.click('Add problem', card(ui));
  await ui.fill('Problem text', '쓰던 문제');
  await ui.click('미적분');
  assert.equal(form(ui), undefined);
  assert.deepEqual(listed(ui), []);
  assert.match(ui.text(card(ui)), /Add contents first/);
});

uiTest('picking another chapter hides the open form until coming back', async () => {
  const ui = await openBook(fakeApi(problems));
  await ui.click('Add problem', card(ui));
  await ui.fill('Problem text', '쓰던 문제');
  await ui.fill('Section', '11');
  assert.equal(form(ui), undefined);
  assert.deepEqual(listed(ui), ['Problem 1:u·v =\n  1']);
  await ui.fill('Section', '10');
  assert.equal(ui.field('Problem text'), '쓰던 문제');
});

uiTest('buttons and the chapter picker are locked while a change is pending', async () => {
  let release = () => {};
  const api = fakeApi(problems, { holdChange: new Promise<void>((r) => (release = r)) });
  const ui = await openBook(api);
  await ui.click('Delete', item(ui, 'Problem 3'));
  await ui.click('Confirm delete', item(ui, 'Problem 3'));
  const controls = ui.find((n) => n.type === 'button' || n.type === 'select', card(ui));
  const copies = controls.filter((n) => ui.text(n) === 'Copy question');
  const others = controls.filter((n) => ui.text(n) !== 'Copy question');
  assert.ok(others.length > 0 && others.every((n) => n.props.disabled), 'locked while pending');
  // Copying only reads, so it stays available.
  assert.ok(copies.length > 0 && copies.every((n) => !n.props.disabled));
  release();
  await ui.settle();
  assert.deepEqual(listed(ui), ['Problem #1:증명하라.']);
});

uiTest('deleting an exercise already gone reports it and reloads', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  await ui.click('Delete', item(ui, 'Problem 3'));
  api.rows.splice(0, 1);
  await ui.click('Confirm delete', item(ui, 'Problem 3'));
  assert.match(alertText(ui), /Exercise not found/);
  assert.deepEqual(listed(ui), ['Problem #1:증명하라.']);
});

uiTest('editing replaces the exercise with PUT and closes the form', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  await ui.click('Edit', item(ui, 'Problem 3'));
  assert.equal(ui.field('Problem text'), '벡터 u를 구하라.');
  await ui.fill('Problem text', '벡터 u의 길이를 구하라.');
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
  assert.deepEqual(listed(ui)[0], 'Problem 3:벡터 u의 길이를 구하라.');
  assert.match(ui.text(card(ui)), /Updated/);
});

uiTest('deleting needs a confirmation', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  await ui.click('Delete', item(ui, 'Problem 3'));
  await ui.click('Cancel', item(ui, 'Problem 3'));
  assert.equal(api.requests.filter((r) => r.method === 'DELETE').length, 0);
  await ui.click('Delete', item(ui, 'Problem 3'));
  await ui.click('Confirm delete', item(ui, 'Problem 3'));
  assert.deepEqual(
    api.requests.filter((r) => r.method === 'DELETE').map((r) => r.path),
    ['/api/exercises/1'],
  );
  assert.deepEqual(listed(ui), ['Problem #1:증명하라.']);
  assert.match(ui.text(card(ui)), /Deleted/);
});

uiTest('a refused save shows the server message and keeps the input', async () => {
  const api = fakeApi([], {
    reject: { method: 'POST', status: 400, error: 'Enter the problem text' },
  });
  const ui = await openBook(api);
  await ui.click('Add problem', card(ui));
  await ui.fill('Problem number', '7');
  await ui.fill('Problem text', '   ');
  await ui.submit(form(ui));
  assert.match(alertText(ui), /Enter the problem text/);
  assert.equal(ui.field('Problem number'), '7');
});

uiTest('saving an edit of an exercise deleted elsewhere closes the form', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  await ui.click('Edit', item(ui, 'Problem 3'));
  api.rows.splice(0, 1);
  await ui.submit(form(ui));
  assert.match(alertText(ui), /Exercise not found/);
  assert.equal(form(ui), undefined);
  assert.deepEqual(listed(ui), ['Problem #1:증명하라.']);
});

uiTest('copy writes the question with textbook, chapter path and number', async () => {
  const copied: string[] = [];
  const clipboard = { writeText: async (text: string) => void copied.push(text) };
  const ui = await openBook(fakeApi(problems), '선형대수', { navigator: { clipboard } });
  await ui.fill('Section', '11');
  await ui.click('Copy question', item(ui, 'Problem 1'));
  assert.deepEqual(copied, [
    [
      'Textbook: 선형대수 (Strang · 5판)',
      'Section: 1 벡터 > 1.2 내적',
      'Problem number: 1',
      '',
      'u·v =\n  1',
      '',
      'Please explain how to solve this exercise step by step, and mention the concepts it needs.',
    ].join('\n'),
  ]);
  assert.match(ui.text(card(ui)), /Copied the question for Problem 1/);
});

uiTest('a failed copy says to copy the body by hand', async () => {
  const refused = {
    writeText: async () => {
      throw new Error('NotAllowedError');
    },
  };
  for (const globals of [{}, { navigator: { clipboard: refused } }]) {
    const ui = await openBook(fakeApi(problems), '선형대수', globals);
    await ui.click('Copy question', item(ui, 'Problem 3'));
    assert.match(alertText(ui), /Could not copy to the clipboard/);
  }
});

uiTest('a chapter added in the contents card can be picked right away', async () => {
  const api = fakeApi();
  const ui = await openBook(api);
  contents[1].push({ id: 30, number: '3', title: '행렬식', children: [] });
  try {
    // Any change in the contents card reloads the tree; adding is the usual one.
    await ui.click('Add chapter');
    await ui.fill('Contents title', '행렬식');
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
  assert.deepEqual(labels, [
    'Problem #1 copy question',
    'Problem #1 show answer',
    'Problem #1 show translation',
    'Problem #1 mark important',
    'Problem #1 edit',
    'Problem #1 delete',
  ]);
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
    'Textbook: 미적분\nSection: 극한\n\n  x → 0 일 때\n\nPlease explain how to solve this exercise step by step, and mention the concepts it needs.',
  );
  // Array.from copies out of the module's realm, which deepEqual would otherwise reject.
  assert.deepEqual(
    Array.from(logic.contentPath(contents[1], 11) ?? [], (node) => node.id),
    [10, 11],
  );
  assert.equal(logic.contentPath(contents[1], 99), undefined);
});

const answerPanel = (ui: Ui) => ui.find((n) => n.props.className === 'exercise-answer', card(ui));

uiTest('an answer is typed in from the problem and shown with its line breaks', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  assert.equal(answerPanel(ui).length, 0);
  await ui.click('Show answer', item(ui, 'Problem 3'));
  assert.match(ui.text(answerPanel(ui)[0]), /No answer entered/);
  await ui.click('Add answer', item(ui, 'Problem 3'));
  await ui.fill('Answer', 'u = (1,\n  2)');
  await ui.submit(item(ui, 'Problem 3'));
  assert.deepEqual(
    api.requests.find((r) => r.method === 'PUT'),
    { method: 'PUT', path: '/api/exercises/1/answer', body: { body: 'u = (1,\n  2)' } },
  );
  const [panel] = answerPanel(ui);
  assert.equal(
    ui.text(ui.find((n) => n.props.className === 'exercise-body', panel)[0]),
    'u = (1,\n  2)',
  );
  assert.equal(ui.find((n) => n.type === 'form', panel).length, 0);
  assert.match(ui.text(card(ui)), /Saved the answer/);
});

uiTest('a saved answer is edited in place and saving it blank deletes it', async () => {
  const api = fakeApi(problems, {}, { 1: '정답은 3' });
  const ui = await openBook(api);
  await ui.click('Show answer', item(ui, 'Problem 3'));
  assert.match(ui.text(answerPanel(ui)[0]), /정답은 3/);
  await ui.click('Edit answer', item(ui, 'Problem 3'));
  assert.equal(ui.field('Answer'), '정답은 3');
  // Cancelling keeps the saved answer.
  await ui.click('Cancel', answerPanel(ui)[0]);
  assert.match(ui.text(answerPanel(ui)[0]), /정답은 3/);
  await ui.click('Edit answer', item(ui, 'Problem 3'));
  await ui.fill('Answer', '  \n ');
  await ui.submit(item(ui, 'Problem 3'));
  assert.deepEqual(
    api.requests.filter((r) => r.method !== 'GET').map((r) => [r.method, r.path]),
    [['DELETE', '/api/exercises/1/answer']],
  );
  assert.equal(api.answers.size, 0);
  assert.match(ui.text(answerPanel(ui)[0]), /No answer entered/);
  assert.match(ui.text(card(ui)), /Cleared the answer/);
});

uiTest('one answer is open at a time and picking a chapter closes it', async () => {
  const api = fakeApi(problems, {}, { 1: '첫 정답', 2: '둘째 정답' });
  const ui = await openBook(api);
  await ui.click('Show answer', item(ui, 'Problem 3'));
  await ui.click('Show answer', item(ui, 'Problem #2'));
  assert.equal(answerPanel(ui).length, 1);
  assert.match(ui.text(item(ui, 'Problem #2')), /둘째 정답/);
  assert.doesNotMatch(ui.text(item(ui, 'Problem 3')), /첫 정답/);
  const [toggle] = ui.find(
    (n) => n.props['aria-label'] === 'Problem #2 hide answer',
    item(ui, 'Problem #2'),
  );
  assert.equal(toggle.props['aria-expanded'], true);
  await ui.click('Hide answer', item(ui, 'Problem #2'));
  assert.equal(answerPanel(ui).length, 0);
  // Another chapter closes it; coming back and opening it loads the answer saved since.
  await ui.click('Show answer', item(ui, 'Problem #2'));
  await ui.fill('Section', '11');
  assert.equal(answerPanel(ui).length, 0);
  api.answers.set(2, '다른 곳에서 고친 정답');
  await ui.fill('Section', '10');
  assert.equal(answerPanel(ui).length, 0);
  await ui.click('Show answer', item(ui, 'Problem #2'));
  assert.match(ui.text(item(ui, 'Problem #2')), /다른 곳에서 고친 정답/);
});

uiTest('clearing an answer already deleted elsewhere counts as cleared', async () => {
  const api = fakeApi(problems, {}, { 1: '정답은 3' });
  const ui = await openBook(api);
  await ui.click('Show answer', item(ui, 'Problem 3'));
  await ui.click('Edit answer', item(ui, 'Problem 3'));
  api.answers.delete(1);
  await ui.fill('Answer', '');
  await ui.submit(item(ui, 'Problem 3'));
  assert.equal(alertText(ui), '');
  assert.match(ui.text(answerPanel(ui)[0]), /No answer entered/);
  assert.match(ui.text(card(ui)), /Cleared the answer/);
});

uiTest('a failed answer load or save is reported in the card', async () => {
  const options: Options = {};
  const api = fakeApi(problems, options);
  const ui = await openBook(api);
  options.reject = { method: 'GET', status: 500, error: 'Server error' };
  await ui.click('Show answer', item(ui, 'Problem 3'));
  assert.match(ui.text(answerPanel(ui)[0]), /Could not load the answer: Server error/);
  options.reject = undefined;
  await ui.click('Hide answer', item(ui, 'Problem 3'));
  await ui.click('Show answer', item(ui, 'Problem 3'));
  await ui.click('Add answer', item(ui, 'Problem 3'));
  await ui.fill('Answer', '답');
  // Deleted elsewhere before saving: the message shows and the exercise leaves the list.
  api.rows.splice(0, 1);
  await ui.submit(item(ui, 'Problem 3'));
  assert.match(alertText(ui), /Exercise not found/);
  assert.deepEqual(listed(ui), ['Problem #1:증명하라.']);
});

const importantCard = (ui: Ui) => ui.find((n) => n.props.className === 'important-exercises')[0];
// Each important exercise as "label:body", in list order.
const importantListed = (ui: Ui) =>
  ui
    .find((n) => n.type === 'li', importantCard(ui))
    .map(
      (li) =>
        ui.text(ui.find((n) => n.props.className === 'log-date', li)[0]) +
        ':' +
        ui.text(ui.find((n) => n.props.className === 'exercise-body', li)[0]),
    );

uiTest('marking an exercise important shows it in the important card', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  assert.deepEqual(importantListed(ui), ['1 벡터 · Problem 3:벡터 u를 구하라.']);
  await ui.click('Mark important', item(ui, 'Problem #2'));
  assert.deepEqual(
    api.requests.find((r) => r.method === 'PATCH'),
    {
      method: 'PATCH',
      path: '/api/exercises/2/important',
      body: { important: true },
    },
  );
  assert.deepEqual(
    ui.find((n) => n.props.className === 'badge important', card(ui)).map((n) => ui.text(n)),
    ['Important', 'Important'],
  );
  assert.match(ui.text(card(ui)), /Marked as important/);
  // The important card reloads after the change.
  assert.deepEqual(importantListed(ui), [
    '1 벡터 · Problem 3:벡터 u를 구하라.',
    '1 벡터 · Unnumbered problem:증명하라.',
  ]);
  await ui.click('Unmark important', item(ui, 'Problem 3'));
  assert.match(ui.text(card(ui)), /Removed the important mark/);
  assert.deepEqual(importantListed(ui), ['1 벡터 · Unnumbered problem:증명하라.']);
});

uiTest('marking an exercise being edited keeps the edit in step', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  await ui.click('Edit', item(ui, 'Problem #2'));
  await ui.click('Mark important', item(ui, 'Problem #2'));
  const [check] = ui.find((n) => n.props.type === 'checkbox', form(ui));
  assert.equal(check.props.checked, true);
  await ui.submit(form(ui));
  assert.deepEqual(api.requests.find((r) => r.method === 'PUT')?.body, {
    number: '',
    body: '증명하라.',
    important: true,
  });
});

uiTest('the important card spans the textbook or one chapter with its sections', async () => {
  const rows: Exercise[] = [
    { id: 1, textbookId: 1, contentId: 20, number: '9', body: '행렬 문제', important: true },
    { id: 2, textbookId: 1, contentId: 11, number: '2', body: '내적 문제', important: true },
    { id: 3, textbookId: 1, contentId: 10, number: '1', body: '벡터 문제', important: true },
    { id: 4, textbookId: 1, contentId: 10, number: '5', body: '안 중요', important: false },
  ];
  const api = fakeApi(rows);
  const ui = await openBook(api);
  // Contents order: chapter 1, its section 1.2, then chapter 2.
  assert.deepEqual(importantListed(ui), [
    '1 벡터 · Problem 1:벡터 문제',
    '1 벡터 > 1.2 내적 · Problem 2:내적 문제',
    '2 행렬 · Problem 9:행렬 문제',
  ]);
  await ui.fill('Scope', '10');
  assert.equal(api.importantLoads.at(-1), '/api/textbooks/1/exercises?important=true&contentId=10');
  assert.deepEqual(importantListed(ui), [
    '1 벡터 · Problem 1:벡터 문제',
    '1 벡터 > 1.2 내적 · Problem 2:내적 문제',
  ]);
  await ui.fill('Scope', '11');
  assert.deepEqual(importantListed(ui), ['1 벡터 > 1.2 내적 · Problem 2:내적 문제']);
  await ui.fill('Scope', '0');
  assert.equal(api.importantLoads.at(-1), '/api/textbooks/1/exercises?important=true');
});

uiTest('unmarking in the important card reloads the exercises card', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  const before = api.requests.length;
  await ui.click('Unmark important', importantCard(ui));
  assert.deepEqual(
    api.requests.slice(before).map((r) => [r.method, r.path]),
    [
      ['PATCH', '/api/exercises/1/important'],
      ['GET', '/api/textbooks/1/contents/10/exercises'],
    ],
  );
  assert.deepEqual(api.requests[before].body, { important: false });
  assert.match(ui.text(importantCard(ui)), /Removed the important mark from 1 벡터 · Problem 3/);
  assert.match(ui.text(importantCard(ui)), /No important problems/);
  assert.equal(ui.find((n) => n.props.className === 'badge important', card(ui)).length, 0);
});

uiTest('a failed important load is reported in its card', async () => {
  const ui = await openBook(fakeApi(problems, { failImportant: true }));
  assert.match(ui.text(importantCard(ui)), /Could not load the important problems: Server error/);
  // The exercises card still works.
  assert.deepEqual(listed(ui), ['Problem 3:벡터 u를 구하라.', 'Problem #2:증명하라.']);
});

// #74: the picked chapter is deleted in another tab. Removes chapter `id` from textbook 1's
// contents for the test and puts it back afterwards.
async function withoutChapter(id: number, run: () => Promise<void>) {
  const index = contents[1].findIndex((node) => node.id === id);
  const [removed] = contents[1].splice(index, 1);
  try {
    await run();
  } finally {
    contents[1].splice(index, 0, removed);
  }
}

uiTest('adding to a chapter deleted elsewhere reloads the contents and moves on', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  await ui.click('Add problem', card(ui));
  await ui.fill('Problem text', '새 문제');
  const loadsBefore = api.treeLoads();
  await withoutChapter(10, async () => {
    await ui.submit(form(ui));
    // The contents card loaded the tree again, and chapter 10 (with its section) left the picker.
    assert.equal(api.treeLoads(), loadsBefore + 1);
    const picker = ui.find((n) => n.type === 'select', card(ui))[0];
    assert.deepEqual(
      ui.find((n) => n.type === 'option', picker).map((n) => n.props.value),
      [20],
    );
    assert.equal(ui.field('Section'), 20);
    assert.match(
      ui.text(card(ui)),
      /The selected section was deleted elsewhere\. Showing the first section/,
    );
    assert.match(ui.text(card(ui)), /No problems entered for this section/);
    assert.doesNotMatch(ui.text(card(ui)), /Could not load the exercises/);
    // Picking a chapter clears the message.
    await ui.fill('Section', '20');
    assert.doesNotMatch(ui.text(card(ui)), /삭제되었습니다/);
  });
});

uiTest('opening a chapter deleted elsewhere reloads the contents too', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  const loadsBefore = api.treeLoads();
  await withoutChapter(20, async () => {
    // The picker still offers chapter 20 from the old tree.
    await ui.fill('Section', '20');
    assert.equal(api.treeLoads(), loadsBefore + 1);
    assert.equal(ui.field('Section'), 10);
    assert.match(ui.text(card(ui)), /The selected section was deleted elsewhere/);
    assert.deepEqual(listed(ui), ['Problem 3:벡터 u를 구하라.', 'Problem #2:증명하라.']);
  });
});

uiTest('a missing exercise does not reload the contents', async () => {
  const api = fakeApi(problems);
  const ui = await openBook(api);
  const loadsBefore = api.treeLoads();
  await ui.click('Delete', item(ui, 'Problem 3'));
  api.rows.splice(0, 1);
  await ui.click('Confirm delete', item(ui, 'Problem 3'));
  assert.match(alertText(ui), /Exercise not found/);
  assert.equal(api.treeLoads(), loadsBefore);
  assert.doesNotMatch(ui.text(card(ui)), /section was deleted elsewhere/);
});

// #75: two submits in the same tick, before the screen re-renders with `busy`, send one request.
const submitTwice = async (ui: Ui, form: Node) => {
  const onSubmit = form.props.onSubmit as (event: { preventDefault(): void }) => unknown;
  const event = { preventDefault() {} };
  void onSubmit(event);
  void onSubmit(event);
  await ui.settle();
};

uiTest('a double submit in the same tick adds the exercise once', async () => {
  const api = fakeApi();
  const ui = await openBook(api);
  await ui.click('Add problem', card(ui));
  await ui.fill('Problem text', '한 번만');
  await submitTwice(ui, form(ui));
  assert.equal(api.requests.filter((r) => r.method === 'POST').length, 1);
  assert.deepEqual(listed(ui), ['Problem #1:한 번만']);
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
  'exercise delete focus: confirm, back on cancel, button on failure, heading on 404',
  async () => {
    const options: Options = {};
    const { focused, document, state } = focusRecorder();
    const api = fakeApi(problems, options);
    const ui = await openBook(api, '선형대수', { document });
    state.ui = ui;
    await press(ui, 'Problem #2 delete');
    assert.equal(focused.at(-1), 'exercise-delete-confirm-2');
    await press(ui, 'Problem #2 cancel deletion');
    assert.equal(focused.at(-1), 'exercise-delete-2');
    options.reject = { method: 'DELETE', status: 500, error: 'Server error' };
    await press(ui, 'Problem #2 delete');
    await press(ui, 'Problem #2 confirm deletion');
    assert.equal(focused.at(-1), 'exercise-delete-2');
    options.reject = undefined;
    api.rows.splice(1, 1);
    await press(ui, 'Problem #2 delete');
    await press(ui, 'Problem #2 confirm deletion');
    assert.match(alertText(ui), /Exercise not found/);
    assert.equal(focused.at(-1), 'exercise-heading');
  },
);

// #31: the Korean translation panel.
const translationPanel = (ui: Ui) =>
  ui.find((n) => n.props.className === 'exercise-answer exercise-translation', card(ui))[0];

uiTest('a translation is made on request and shown with its answer', async () => {
  const api = fakeApi(problems, {}, { 1: 'u = (1,\n  2)' });
  const ui = await openBook(api);
  await ui.click('Show translation', item(ui, 'Problem 3'));
  assert.match(ui.text(translationPanel(ui)), /Not translated yet/);
  await ui.click('Translate', translationPanel(ui));
  assert.deepEqual(
    api.requests.filter((r) => r.path.endsWith('/translation')).map((r) => r.method),
    ['GET', 'POST'],
  );
  // A JSON body: the API refuses a paid request that is not JSON.
  assert.deepEqual(api.requests.find((r) => r.method === 'POST')?.body, {});
  const text = ui.text(translationPanel(ui));
  assert.match(text, /Translation: 벡터 u를 구하라\./);
  assert.match(text, /Answer translationTranslation: u = \(1,\n {2}2\)/);
  assert.match(text, /AI translation \(claude-sonnet-5-5, 2026-10-23 17:00\) can be wrong/);
  assert.match(text, /Translated/);
  // Translating again replaces it.
  assert.ok(
    ui.find((n) => n.type === 'button' && ui.text(n) === 'Translate again', translationPanel(ui))
      .length,
  );
  // The panel closes from the same button.
  await ui.click('Hide translation', item(ui, 'Problem 3'));
  assert.equal(translationPanel(ui), undefined);
});

uiTest('an out-of-date translation says so; a failed one says why', async () => {
  const api = fakeApi(problems, {
    translations: {
      2: {
        body: '증명하라 (옛 번역)',
        answer: null,
        model: 'claude-sonnet-5-5',
        updatedAt: '2026-10-20 09:00',
        stale: true,
      },
    },
    failTranslate: {
      status: 503,
      error: 'The translation API key (ANTHROPIC_API_KEY) is not set on the server',
    },
  });
  const ui = await openBook(api);
  await ui.click('Show translation', item(ui, 'Problem #2'));
  assert.match(
    ui.text(translationPanel(ui)),
    /The problem or answer changed after it was translated/,
  );
  assert.match(ui.text(translationPanel(ui)), /증명하라 \(옛 번역\)/);
  await ui.click('Translate again', translationPanel(ui));
  assert.match(
    alertText(ui),
    /Could not translate: The translation API key \(ANTHROPIC_API_KEY\) is not set on the server/,
  );
  // The old translation stays on screen.
  assert.match(ui.text(translationPanel(ui)), /증명하라 \(옛 번역\)/);
});

uiTest('the translate button is locked while one is being made', async () => {
  let release = () => {};
  const api = fakeApi(problems, { holdChange: new Promise<void>((r) => (release = r)) });
  const ui = await openBook(api);
  await ui.click('Show translation', item(ui, 'Problem 3'));
  await ui.click('Translate', translationPanel(ui));
  assert.match(ui.text(translationPanel(ui)), /Translating/);
  const [button] = ui.find((n) => n.type === 'button', translationPanel(ui));
  assert.ok(button.props.disabled);
  release();
  await ui.settle();
  assert.match(ui.text(translationPanel(ui)), /Translated/);
  assert.equal(api.requests.filter((r) => r.method === 'POST').length, 1);
});
