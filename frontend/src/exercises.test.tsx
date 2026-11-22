import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { contentPath, questionText } from './exercise';
import type { ContentNode } from './textbook';
import { Textbooks } from './textbooks';

// The whole Textbooks page renders in each test and role queries are slow on the first run.
vi.setConfig({ testTimeout: 30_000 });

type Exercise = {
  id: number;
  textbookId: number;
  contentId: number;
  number: string;
  body: string;
  important: boolean;
};
type Tree = ContentNode;

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

type Translation = {
  body: string;
  answer: string | null;
  model: string;
  updatedAt: string;
  stale: boolean;
};

type Options = {
  // Every exercise request of this method answers this error instead (read lazily).
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

// In-memory exercises API with the textbook list and contents; records exercise requests.
function fakeServer(
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
  let treeLoads = 0;
  let nextId = 100;
  const reply = (status: number, body?: unknown) =>
    new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status });
  const flat = (nodes: Tree[]): Tree[] => nodes.flatMap((n) => [n, ...flat(n.children)]);

  const handle = async (
    path: string,
    init: { method?: string; body?: string } = {},
  ): Promise<Response> => {
    const method = init.method ?? 'GET';
    const body =
      init.body === undefined ? undefined : (JSON.parse(init.body) as Record<string, unknown>);
    if (path === '/api/textbooks') return reply(200, { textbooks: books });
    const tree = path.match(/^\/api\/textbooks\/(\d+)\/contents$/);
    if (tree) {
      if (method === 'POST') return reply(201, {});
      treeLoads++;
      return options.failContents
        ? reply(500, { error: 'Server error' })
        : // A copy, as from the server: a chapter removed later stays in the tree on screen.
          reply(200, { contents: structuredClone(contents[Number(tree[1])]) });
    }
    const across = path.match(/^\/api\/textbooks\/(\d+)\/exercises\?(.*)$/);
    if (across) {
      importantLoads.push(path);
      if (options.failImportant) return reply(500, { error: 'Server error' });
      const query = new URLSearchParams(across[2]);
      // The picked chapter and its sections, in contents order.
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
      if (!flat(contents[textbookId]).some((n) => n.id === contentId))
        return reply(404, { error: 'Contents entry not found' });
      if (method === 'GET')
        return reply(200, {
          exercises: rows.filter((r) => r.textbookId === textbookId && r.contentId === contentId),
        });
      const row = { id: nextId++, textbookId, contentId, ...body } as Exercise;
      rows.push(row);
      return reply(201, { exercise: row });
    }
    const ofAnswer = path.match(/^\/api\/exercises\/(\d+)\/answer$/);
    if (ofAnswer) {
      const id = Number(ofAnswer[1]);
      if (!rows.some((r) => r.id === id)) return reply(404, { error: 'Exercise not found' });
      if (method === 'PUT') answers.set(id, String(body?.body));
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
      row.important = body?.important as boolean;
      return reply(200, { exercise: row });
    }
    const one = path.match(/^\/api\/exercises\/(\d+)$/);
    if (!one) throw new Error('unexpected request ' + path);
    const index = rows.findIndex((r) => r.id === Number(one[1]));
    if (index < 0) return reply(404, { error: 'Exercise not found' });
    if (method === 'PUT') {
      rows[index] = { ...rows[index], ...body };
      return reply(200, { exercise: rows[index] });
    }
    rows.splice(index, 1);
    return reply(204);
  };

  vi.stubGlobal('fetch', vi.fn(handle));
  return { requests, rows, answers, importantLoads, treeLoads: () => treeLoads };
}
type Api = ReturnType<typeof fakeServer>;

const problems: Exercise[] = [
  { id: 1, textbookId: 1, contentId: 10, number: '3', body: '벡터 u를 구하라.', important: true },
  { id: 2, textbookId: 1, contentId: 10, number: '', body: '증명하라.', important: false },
  { id: 3, textbookId: 1, contentId: 11, number: '1', body: 'u·v =\n  1', important: false },
];

let title = '선형대수';
const section = (name: string) => {
  const found = document.querySelector<HTMLElement>(`section[aria-label="${title} ${name}"]`);
  if (!found) throw new Error(`no ${name} card`);
  return found;
};
const card = () => section('exercises');
const importantCard = () => section('important problems');
const form = () => card().querySelector<HTMLFormElement>('form.exercise-form');
const alertEl = (scope: HTMLElement = card()) => scope.querySelector('[role="alert"]');
const textOf = (el: Element | null | undefined) => el?.textContent ?? '';

const entries = (scope: HTMLElement) =>
  Array.from(scope.querySelectorAll('li')).map((li) => ({
    li,
    label: textOf(li.querySelector('.log-date')),
    body: textOf(li.querySelector('.exercise-body')),
  }));
// Each exercise as "label:body", in list order.
const listed = () => entries(card()).map((e) => `${e.label}:${e.body}`);
const importantListed = () => entries(importantCard()).map((e) => `${e.label}:${e.body}`);
const item = (label: string) => entries(card()).find((e) => e.label === label)?.li as HTMLElement;
const badges = (scope: HTMLElement) =>
  Array.from(scope.querySelectorAll('.badge.important')).map((n) => textOf(n));

const expectListed = (rows: string[]) => waitFor(() => expect(listed()).toEqual(rows));
const expectImportant = (rows: string[]) => waitFor(() => expect(importantListed()).toEqual(rows));
const expectText = (pattern: RegExp, scope: () => HTMLElement = card) =>
  waitFor(() => expect(textOf(scope())).toMatch(pattern));

const field = (label: string, scope: () => HTMLElement = card) =>
  within(scope()).getByLabelText<HTMLInputElement>(label);
const fill = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const pickSection = (value: string) => fireEvent.change(field('Section'), { target: { value } });

// Clicks the button with this name once it is on screen and enabled.
async function press(name: string | RegExp, scope: () => HTMLElement | undefined = card) {
  const button = await waitFor(() => {
    const element = scope();
    if (!element) throw new Error('scope is not on screen');
    const found = within(element).getByRole('button', { name });
    expect(found).toBeEnabled();
    return found;
  });
  fireEvent.click(button);
}
const answerPanel = (label: string) => () =>
  item(label)?.querySelector<HTMLElement>('.exercise-answer') ?? undefined;
const panels = () => card().querySelectorAll('.exercise-answer');

// Opens the Textbooks page and selects a textbook; resolves once its exercises card has loaded.
async function openBook(_api: Api, name = '선형대수') {
  title = name;
  render(<Textbooks />);
  fireEvent.click(await screen.findByRole('button', { name }));
  await waitFor(() => {
    expect(card()).toBeTruthy();
    expect(card().querySelector('[aria-busy="true"]')).toBeNull();
  });
}

// Records the exercise card's focus calls (real elements, through to the real focus).
function recordFocus() {
  const spy = vi.spyOn(HTMLElement.prototype, 'focus');
  return () =>
    (spy.mock.contexts as HTMLElement[]).map((el) => el.id).filter((id) => /^exercise-/.test(id));
}
const setClipboard = (clipboard: unknown) =>
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('exercises', () => {
  test('the first chapter is picked and its exercises are listed in order', async () => {
    const api = fakeServer(problems);
    await openBook(api);
    expect(field('Section')).toHaveValue('10');
    expect(listed()).toEqual(['Problem 3:벡터 u를 구하라.', 'Problem #2:증명하라.']);
    // Only the important one has the badge.
    expect(badges(card())).toEqual(['Important']);
    // Picking a section lists its exercises, with line breaks kept in the body.
    pickSection('11');
    await expectListed(['Problem 1:u·v =\n  1']);
    expect(api.requests.map((r) => r.path)).toEqual([
      '/api/textbooks/1/contents/10/exercises',
      '/api/textbooks/1/contents/11/exercises',
    ]);
    pickSection('20');
    await expectText(/No problems entered for this section/);
  });

  test('a textbook without contents asks for contents first', async () => {
    await openBook(fakeServer(), '미적분');
    expect(textOf(card())).toMatch(/Add contents first/);
    expect(within(card()).getByRole('button', { name: 'Add problem' })).toBeDisabled();
  });

  test('adding posts the exercise and keeps the form open for the next one', async () => {
    const api = fakeServer();
    await openBook(api);
    await press('Add problem');
    fill('Problem number', '5');
    fill('Problem text', '행렬 A의\n역행렬을 구하라.');
    fireEvent.click(field('Mark as important'));
    fireEvent.submit(form()!);
    await expectListed(['Problem 5:행렬 A의\n역행렬을 구하라.']);
    expect(api.requests.at(-2)).toEqual({
      method: 'POST',
      path: '/api/textbooks/1/contents/10/exercises',
      body: { number: '5', body: '행렬 A의\n역행렬을 구하라.', important: true },
    });
    await expectText(/Added/);
    // Still open and empty for the next exercise.
    expect(field('Problem number')).toHaveValue('');
    expect(field('Problem text')).toHaveValue('');
  });

  test('the body takes focus when the form opens and again after each add', async () => {
    const focused = recordFocus();
    await openBook(fakeServer());
    await press('Add problem');
    await waitFor(() => expect(focused()).toEqual(['exercise-body']));
    fill('Problem text', '첫 문제');
    fireEvent.submit(form()!);
    // Once the save and the reload are done and the field is enabled again.
    await waitFor(() => expect(focused()).toEqual(['exercise-body', 'exercise-body']));
  });

  test('deleting another exercise keeps the edit open and focus follows the delete', async () => {
    const focused = recordFocus();
    await openBook(fakeServer(problems));
    await press('Problem 3 edit');
    await waitFor(() => expect(focused()).toEqual(['exercise-body']));
    await press('Problem #2 delete', () => item('Problem #2'));
    await press('Problem #2 confirm deletion', () => item('Problem #2'));
    await expectListed(['Problem 3:벡터 u를 구하라.']);
    // The confirm button, then the card heading once the exercise is gone (#86).
    await waitFor(() =>
      expect(focused()).toEqual(['exercise-body', 'exercise-delete-confirm-2', 'exercise-heading']),
    );
    // The edit stays open with its input.
    expect(field('Problem text')).toHaveValue('벡터 u를 구하라.');
  });

  test('a failed contents load says the chapters cannot be picked', async () => {
    await openBook(fakeServer([], { failContents: true }));
    await expectText(/Could not load the contents, so a section cannot be chosen/);
    expect(textOf(card())).not.toMatch(/Loading/);
  });

  test('switching textbooks shows nothing of the previous one', async () => {
    const api = fakeServer(problems);
    await openBook(api);
    await press('Add problem');
    fill('Problem text', '쓰던 문제');
    title = '미적분';
    fireEvent.click(screen.getByRole('button', { name: '미적분' }));
    await expectText(/Add contents first/);
    expect(form()).toBeNull();
    expect(listed()).toEqual([]);
  });

  test('picking another chapter hides the open form until coming back', async () => {
    await openBook(fakeServer(problems));
    await press('Add problem');
    fill('Problem text', '쓰던 문제');
    pickSection('11');
    await expectListed(['Problem 1:u·v =\n  1']);
    expect(form()).toBeNull();
    pickSection('10');
    await waitFor(() => expect(field('Problem text')).toHaveValue('쓰던 문제'));
  });

  test('buttons and the chapter picker are locked while a change is pending', async () => {
    let release = () => {};
    const api = fakeServer(problems, { holdChange: new Promise<void>((r) => (release = r)) });
    await openBook(api);
    await press('Problem 3 delete', () => item('Problem 3'));
    await press('Problem 3 confirm deletion', () => item('Problem 3'));
    const controls = () => Array.from(card().querySelectorAll<HTMLElement>('button, select'));
    const copy = (el: HTMLElement) => el.getAttribute('aria-label')?.endsWith('copy question');
    await waitFor(() => {
      const others = controls().filter((el) => !copy(el));
      expect(others.length).toBeGreaterThan(0);
      for (const el of others) expect(el).toBeDisabled();
    });
    // Copying only reads, so it stays available.
    const copies = controls().filter(copy);
    expect(copies.length).toBeGreaterThan(0);
    for (const el of copies) expect(el).toBeEnabled();
    release();
    await expectListed(['Problem #1:증명하라.']);
  });

  test('deleting an exercise already gone reports it and reloads', async () => {
    const api = fakeServer(problems);
    await openBook(api);
    await press('Problem 3 delete', () => item('Problem 3'));
    api.rows.splice(0, 1);
    await press('Problem 3 confirm deletion', () => item('Problem 3'));
    await expectText(/Exercise not found/);
    await expectListed(['Problem #1:증명하라.']);
  });

  test('editing replaces the exercise with PUT and closes the form', async () => {
    const api = fakeServer(problems);
    await openBook(api);
    await press('Problem 3 edit');
    expect(field('Problem text')).toHaveValue('벡터 u를 구하라.');
    fill('Problem text', '벡터 u의 길이를 구하라.');
    fireEvent.submit(form()!);
    await expectListed(['Problem 3:벡터 u의 길이를 구하라.', 'Problem #2:증명하라.']);
    expect(api.requests.find((r) => r.method === 'PUT')).toEqual({
      method: 'PUT',
      path: '/api/exercises/1',
      body: { number: '3', body: '벡터 u의 길이를 구하라.', important: true },
    });
    expect(form()).toBeNull();
    await expectText(/Updated/);
  });

  test('deleting needs a confirmation', async () => {
    const api = fakeServer(problems);
    await openBook(api);
    await press('Problem 3 delete', () => item('Problem 3'));
    await press('Problem 3 cancel deletion', () => item('Problem 3'));
    expect(api.requests.filter((r) => r.method === 'DELETE')).toHaveLength(0);
    await press('Problem 3 delete', () => item('Problem 3'));
    await press('Problem 3 confirm deletion', () => item('Problem 3'));
    await expectListed(['Problem #1:증명하라.']);
    expect(api.requests.filter((r) => r.method === 'DELETE').map((r) => r.path)).toEqual([
      '/api/exercises/1',
    ]);
    await expectText(/Deleted/);
  });

  test('a refused save shows the server message and keeps the input', async () => {
    const api = fakeServer([], {
      reject: { method: 'POST', status: 400, error: 'Enter the problem text' },
    });
    await openBook(api);
    await press('Add problem');
    fill('Problem number', '7');
    fill('Problem text', '   ');
    fireEvent.submit(form()!);
    await expectText(/Enter the problem text/);
    expect(textOf(alertEl())).toMatch(/Enter the problem text/);
    expect(field('Problem number')).toHaveValue('7');
  });

  test('saving an edit of an exercise deleted elsewhere closes the form', async () => {
    const api = fakeServer(problems);
    await openBook(api);
    await press('Problem 3 edit');
    api.rows.splice(0, 1);
    fireEvent.submit(form()!);
    await expectListed(['Problem #1:증명하라.']);
    expect(textOf(alertEl())).toMatch(/Exercise not found/);
    expect(form()).toBeNull();
  });

  test('copy writes the question with textbook, chapter path and number', async () => {
    const copied: string[] = [];
    setClipboard({ writeText: (text: string) => Promise.resolve(void copied.push(text)) });
    await openBook(fakeServer(problems));
    pickSection('11');
    await expectListed(['Problem 1:u·v =\n  1']);
    await press('Problem 1 copy question');
    await expectText(/Copied the question for Problem 1/);
    expect(copied).toEqual([
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
  });

  test('a failed copy says to copy the body by hand', async () => {
    const refused = {
      writeText: () => Promise.reject(new Error('NotAllowedError')),
    };
    for (const clipboard of [undefined, refused]) {
      if (clipboard) setClipboard(clipboard);
      const { unmount } = render(<div />);
      unmount();
      await openBook(fakeServer(problems));
      await press('Problem 3 copy question');
      await expectText(/Could not copy to the clipboard/);
      expect(textOf(alertEl())).toMatch(/Could not copy to the clipboard/);
      document.body.innerHTML = '';
    }
  });

  test('a chapter added in the contents card can be picked right away', async () => {
    await openBook(fakeServer());
    contents[1].push({ id: 30, number: '3', title: '행렬식', children: [] });
    try {
      // Any change in the contents card reloads the tree; adding is the usual one.
      await press('Add chapter', () => section('contents'));
      fireEvent.change(within(section('contents')).getByLabelText('Contents title'), {
        target: { value: '행렬식' },
      });
      fireEvent.submit(section('contents').querySelector('form.content-form')!);
      await waitFor(() =>
        expect(Array.from(field('Section').querySelectorAll('option')).map((o) => o.value)).toEqual(
          ['10', '11', '20', '30'],
        ),
      );
    } finally {
      contents[1].pop();
    }
  });

  test('exercise buttons name the exercise they act on', async () => {
    await openBook(fakeServer([problems[1]]));
    const labels = Array.from(card().querySelectorAll('button[aria-label]')).map((n) =>
      n.getAttribute('aria-label'),
    );
    expect(labels).toEqual([
      'Problem #1 copy question',
      'Problem #1 show answer',
      'Problem #1 show translation',
      'Problem #1 mark important',
      'Problem #1 edit',
      'Problem #1 delete',
    ]);
  });

  test('the question leaves out a blank number and blank lines around the body', () => {
    expect(
      questionText({ title: '미적분', author: '', edition: '' }, [{ number: '', title: '극한' }], {
        number: ' ',
        body: '\n\n  x → 0 일 때\n\n',
      }),
    ).toBe(
      'Textbook: 미적분\nSection: 극한\n\n  x → 0 일 때\n\nPlease explain how to solve this exercise step by step, and mention the concepts it needs.',
    );
    expect(contentPath(contents[1], 11)?.map((node) => node.id)).toEqual([10, 11]);
    expect(contentPath(contents[1], 99)).toBeUndefined();
  });
});

describe('exercise answers', () => {
  test('an answer is typed in from the problem and shown with its line breaks', async () => {
    const api = fakeServer(problems);
    await openBook(api);
    expect(panels()).toHaveLength(0);
    await press('Problem 3 show answer', () => item('Problem 3'));
    await expectText(/No answer entered/, () => answerPanel('Problem 3')()!);
    await press('Problem 3 add answer', () => item('Problem 3'));
    fill('Answer', 'u = (1,\n  2)');
    fireEvent.submit(item('Problem 3').querySelector('form')!);
    await expectText(/Saved the answer/);
    expect(api.requests.find((r) => r.method === 'PUT')).toEqual({
      method: 'PUT',
      path: '/api/exercises/1/answer',
      body: { body: 'u = (1,\n  2)' },
    });
    const panel = answerPanel('Problem 3')()!;
    expect(textOf(panel.querySelector('.exercise-body'))).toBe('u = (1,\n  2)');
    expect(panel.querySelector('form')).toBeNull();
  });

  test('a saved answer is edited in place and saving it blank deletes it', async () => {
    const api = fakeServer(problems, {}, { 1: '정답은 3' });
    await openBook(api);
    await press('Problem 3 show answer', () => item('Problem 3'));
    await expectText(/정답은 3/, () => answerPanel('Problem 3')()!);
    await press('Problem 3 edit answer', () => item('Problem 3'));
    expect(field('Answer')).toHaveValue('정답은 3');
    // Cancelling keeps the saved answer.
    await press('Cancel', answerPanel('Problem 3'));
    await expectText(/정답은 3/, () => answerPanel('Problem 3')()!);
    await press('Problem 3 edit answer', () => item('Problem 3'));
    fill('Answer', '  \n ');
    fireEvent.submit(item('Problem 3').querySelector('form')!);
    await expectText(/Cleared the answer/);
    expect(api.requests.filter((r) => r.method !== 'GET').map((r) => [r.method, r.path])).toEqual([
      ['DELETE', '/api/exercises/1/answer'],
    ]);
    expect(api.answers.size).toBe(0);
    expect(textOf(answerPanel('Problem 3')())).toMatch(/No answer entered/);
  });

  test('one answer is open at a time and picking a chapter closes it', async () => {
    const api = fakeServer(problems, {}, { 1: '첫 정답', 2: '둘째 정답' });
    await openBook(api);
    await press('Problem 3 show answer', () => item('Problem 3'));
    await press('Problem #2 show answer', () => item('Problem #2'));
    await expectText(/둘째 정답/, () => item('Problem #2'));
    expect(panels()).toHaveLength(1);
    expect(textOf(item('Problem 3'))).not.toMatch(/첫 정답/);
    expect(
      within(item('Problem #2')).getByRole('button', { name: 'Problem #2 hide answer' }),
    ).toHaveAttribute('aria-expanded', 'true');
    await press('Problem #2 hide answer', () => item('Problem #2'));
    expect(panels()).toHaveLength(0);
    // Another chapter closes it; coming back and opening it loads the answer saved since.
    await press('Problem #2 show answer', () => item('Problem #2'));
    pickSection('11');
    await expectListed(['Problem 1:u·v =\n  1']);
    expect(panels()).toHaveLength(0);
    api.answers.set(2, '다른 곳에서 고친 정답');
    pickSection('10');
    await expectListed(['Problem 3:벡터 u를 구하라.', 'Problem #2:증명하라.']);
    expect(panels()).toHaveLength(0);
    await press('Problem #2 show answer', () => item('Problem #2'));
    await expectText(/다른 곳에서 고친 정답/, () => item('Problem #2'));
  });

  test('clearing an answer already deleted elsewhere counts as cleared', async () => {
    const api = fakeServer(problems, {}, { 1: '정답은 3' });
    await openBook(api);
    await press('Problem 3 show answer', () => item('Problem 3'));
    await press('Problem 3 edit answer', () => item('Problem 3'));
    api.answers.delete(1);
    fill('Answer', '');
    fireEvent.submit(item('Problem 3').querySelector('form')!);
    await expectText(/Cleared the answer/);
    expect(alertEl()).toBeNull();
    expect(textOf(answerPanel('Problem 3')())).toMatch(/No answer entered/);
  });

  test('a failed answer load or save is reported in the card', async () => {
    const options: Options = {};
    const api = fakeServer(problems, options);
    await openBook(api);
    options.reject = { method: 'GET', status: 500, error: 'Server error' };
    await press('Problem 3 show answer', () => item('Problem 3'));
    await expectText(/Could not load the answer: Server error/, () => answerPanel('Problem 3')()!);
    options.reject = undefined;
    await press('Problem 3 hide answer', () => item('Problem 3'));
    await press('Problem 3 show answer', () => item('Problem 3'));
    await press('Problem 3 add answer', () => item('Problem 3'));
    fill('Answer', '답');
    // Deleted elsewhere before saving: the message shows and the exercise leaves the list.
    api.rows.splice(0, 1);
    fireEvent.submit(item('Problem 3').querySelector('form')!);
    await expectListed(['Problem #1:증명하라.']);
    expect(textOf(alertEl())).toMatch(/Exercise not found/);
  });
});

describe('important exercises', () => {
  test('marking an exercise important shows it in the important card', async () => {
    const api = fakeServer(problems);
    await openBook(api);
    await expectImportant(['1 벡터 · Problem 3:벡터 u를 구하라.']);
    await press('Problem #2 mark important', () => item('Problem #2'));
    await expectText(/Marked as important/);
    expect(api.requests.find((r) => r.method === 'PATCH')).toEqual({
      method: 'PATCH',
      path: '/api/exercises/2/important',
      body: { important: true },
    });
    expect(badges(card())).toEqual(['Important', 'Important']);
    // The important card reloads after the change.
    await expectImportant([
      '1 벡터 · Problem 3:벡터 u를 구하라.',
      '1 벡터 · Unnumbered problem:증명하라.',
    ]);
    await press('Problem 3 unmark important', () => item('Problem 3'));
    await expectText(/Removed the important mark/);
    await expectImportant(['1 벡터 · Unnumbered problem:증명하라.']);
  });

  test('marking an exercise being edited keeps the edit in step', async () => {
    const api = fakeServer(problems);
    await openBook(api);
    await press('Problem #2 edit', () => item('Problem #2'));
    await press('Problem #2 mark important', () => item('Problem #2'));
    await waitFor(() => expect(field('Mark as important')).toBeChecked());
    await waitFor(() => expect(within(card()).getByLabelText('Mark as important')).toBeEnabled());
    fireEvent.submit(form()!);
    await waitFor(() =>
      expect(api.requests.find((r) => r.method === 'PUT')?.body).toEqual({
        number: '',
        body: '증명하라.',
        important: true,
      }),
    );
  });

  test('the important card spans the textbook or one chapter with its sections', async () => {
    const rows: Exercise[] = [
      { id: 1, textbookId: 1, contentId: 20, number: '9', body: '행렬 문제', important: true },
      { id: 2, textbookId: 1, contentId: 11, number: '2', body: '내적 문제', important: true },
      { id: 3, textbookId: 1, contentId: 10, number: '1', body: '벡터 문제', important: true },
      { id: 4, textbookId: 1, contentId: 10, number: '5', body: '안 중요', important: false },
    ];
    const api = fakeServer(rows);
    await openBook(api);
    // Contents order: chapter 1, its section 1.2, then chapter 2.
    await expectImportant([
      '1 벡터 · Problem 1:벡터 문제',
      '1 벡터 > 1.2 내적 · Problem 2:내적 문제',
      '2 행렬 · Problem 9:행렬 문제',
    ]);
    const scope = (value: string) =>
      fireEvent.change(within(importantCard()).getByLabelText('Scope'), { target: { value } });
    scope('10');
    await expectImportant([
      '1 벡터 · Problem 1:벡터 문제',
      '1 벡터 > 1.2 내적 · Problem 2:내적 문제',
    ]);
    expect(api.importantLoads.at(-1)).toBe(
      '/api/textbooks/1/exercises?important=true&contentId=10',
    );
    scope('11');
    await expectImportant(['1 벡터 > 1.2 내적 · Problem 2:내적 문제']);
    scope('0');
    await expectImportant([
      '1 벡터 · Problem 1:벡터 문제',
      '1 벡터 > 1.2 내적 · Problem 2:내적 문제',
      '2 행렬 · Problem 9:행렬 문제',
    ]);
    expect(api.importantLoads.at(-1)).toBe('/api/textbooks/1/exercises?important=true');
  });

  test('unmarking in the important card reloads the exercises card', async () => {
    const api = fakeServer(problems);
    await openBook(api);
    await expectImportant(['1 벡터 · Problem 3:벡터 u를 구하라.']);
    const before = api.requests.length;
    await press('1 벡터 · Problem 3 unmark important', importantCard);
    await waitFor(() =>
      expect(api.requests.slice(before).map((r) => [r.method, r.path])).toEqual([
        ['PATCH', '/api/exercises/1/important'],
        ['GET', '/api/textbooks/1/contents/10/exercises'],
      ]),
    );
    expect(api.requests[before].body).toEqual({ important: false });
    await expectText(/Removed the important mark from 1 벡터 · Problem 3/, importantCard);
    await expectText(/No important problems/, importantCard);
    await waitFor(() => expect(badges(card())).toEqual([]));
  });

  test('a failed important load is reported in its card', async () => {
    await openBook(fakeServer(problems, { failImportant: true }));
    await expectText(/Could not load the important problems: Server error/, importantCard);
    // The exercises card still works.
    expect(listed()).toEqual(['Problem 3:벡터 u를 구하라.', 'Problem #2:증명하라.']);
  });
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

describe('exercises changed elsewhere', () => {
  test('adding to a chapter deleted elsewhere reloads the contents and moves on', async () => {
    const api = fakeServer(problems);
    await openBook(api);
    await press('Add problem');
    fill('Problem text', '새 문제');
    const loadsBefore = api.treeLoads();
    await withoutChapter(10, async () => {
      fireEvent.submit(form()!);
      // The contents card loaded the tree again, and chapter 10 (with its section) left the picker.
      await waitFor(() =>
        expect(Array.from(field('Section').querySelectorAll('option')).map((o) => o.value)).toEqual(
          ['20'],
        ),
      );
      expect(api.treeLoads()).toBe(loadsBefore + 1);
      expect(field('Section')).toHaveValue('20');
      await expectText(/The selected section was deleted elsewhere\. Showing the first section/);
      await expectText(/No problems entered for this section/);
      expect(textOf(card())).not.toMatch(/Could not load the exercises/);
    });
  });

  test('opening a chapter deleted elsewhere reloads the contents too', async () => {
    const api = fakeServer(problems);
    await openBook(api);
    const loadsBefore = api.treeLoads();
    await withoutChapter(20, async () => {
      // The picker still offers chapter 20 from the old tree.
      pickSection('20');
      await expectText(/The selected section was deleted elsewhere/);
      expect(api.treeLoads()).toBe(loadsBefore + 1);
      expect(field('Section')).toHaveValue('10');
      await expectListed(['Problem 3:벡터 u를 구하라.', 'Problem #2:증명하라.']);
    });
  });

  test('a missing exercise does not reload the contents', async () => {
    const api = fakeServer(problems);
    await openBook(api);
    const loadsBefore = api.treeLoads();
    await press('Problem 3 delete', () => item('Problem 3'));
    api.rows.splice(0, 1);
    await press('Problem 3 confirm deletion', () => item('Problem 3'));
    await expectListed(['Problem #1:증명하라.']);
    expect(textOf(alertEl())).toMatch(/Exercise not found/);
    expect(api.treeLoads()).toBe(loadsBefore);
    expect(textOf(card())).not.toMatch(/section was deleted elsewhere/);
  });

  // #75: two submits in the same tick, before the screen re-renders with `busy`, send one request.
  test('a double submit in the same tick adds the exercise once', async () => {
    const api = fakeServer();
    await openBook(api);
    await press('Add problem');
    fill('Problem text', '한 번만');
    const target = form()!;
    act(() => {
      fireEvent.submit(target);
      fireEvent.submit(target);
    });
    await expectListed(['Problem #1:한 번만']);
    expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });

  // #86: focus is checked on the real elements, so an id with no element (a typo) fails too.
  test('exercise delete focus: confirm, back on cancel, button on failure, heading on 404', async () => {
    const options: Options = {};
    const api = fakeServer(problems, options);
    await openBook(api);
    const focusedId = () => document.activeElement?.id;
    const entry = () => item('Problem #2');
    await press('Problem #2 delete', entry);
    await waitFor(() => expect(focusedId()).toBe('exercise-delete-confirm-2'));
    await press('Problem #2 cancel deletion', entry);
    await waitFor(() => expect(focusedId()).toBe('exercise-delete-2'));
    options.reject = { method: 'DELETE', status: 500, error: 'Server error' };
    await press('Problem #2 delete', entry);
    await press('Problem #2 confirm deletion', entry);
    await expectText(/Server error/);
    await waitFor(() => expect(focusedId()).toBe('exercise-delete-2'));
    options.reject = undefined;
    api.rows.splice(1, 1);
    await press('Problem #2 delete', entry);
    await press('Problem #2 confirm deletion', entry);
    await expectText(/Exercise not found/);
    await waitFor(() => expect(focusedId()).toBe('exercise-heading'));
  });
});

// #31: the Korean translation panel.
describe('exercise translation', () => {
  const panel = (label: string) => () =>
    within(card()).getByRole('region', { name: `${label} Korean translation` });

  test('a translation is made on request and shown with its answer', async () => {
    const api = fakeServer(problems, {}, { 1: 'u = (1,\n  2)' });
    await openBook(api);
    await press('Problem 3 show translation', () => item('Problem 3'));
    await expectText(/Not translated yet/, panel('Problem 3'));
    await press('Problem 3 translate', panel('Problem 3'));
    await expectText(/Translated/, panel('Problem 3'));
    expect(
      api.requests.filter((r) => r.path.endsWith('/translation')).map((r) => r.method),
    ).toEqual(['GET', 'POST']);
    // A JSON body: the API refuses a paid request that is not JSON.
    expect(api.requests.find((r) => r.method === 'POST')?.body).toEqual({});
    const text = textOf(panel('Problem 3')());
    expect(text).toMatch(/Translation: 벡터 u를 구하라\./);
    expect(text).toMatch(/Answer translationTranslation: u = \(1,\n {2}2\)/);
    expect(text).toMatch(/AI translation \(claude-sonnet-5-5, 2026-10-23 17:00\) can be wrong/);
    // Translating again replaces it.
    expect(
      within(panel('Problem 3')()).getByRole('button', { name: 'Problem 3 translate again' }),
    ).toBeInTheDocument();
    // The panel closes from the same button.
    await press('Problem 3 hide translation', () => item('Problem 3'));
    expect(
      within(card()).queryByRole('region', { name: 'Problem 3 Korean translation' }),
    ).toBeNull();
  });

  test('an out-of-date translation says so; a failed one says why', async () => {
    const api = fakeServer(problems, {
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
    await openBook(api);
    await press('Problem #2 show translation', () => item('Problem #2'));
    await expectText(/The problem or answer changed after it was translated/, panel('Problem #2'));
    expect(textOf(panel('Problem #2')())).toMatch(/증명하라 \(옛 번역\)/);
    await press('Problem #2 translate again', panel('Problem #2'));
    await waitFor(() =>
      expect(textOf(alertEl())).toMatch(
        /Could not translate: The translation API key \(ANTHROPIC_API_KEY\) is not set on the server/,
      ),
    );
    // The old translation stays on screen.
    expect(textOf(panel('Problem #2')())).toMatch(/증명하라 \(옛 번역\)/);
  });

  test('the translate button is locked while one is being made', async () => {
    let release = () => {};
    const api = fakeServer(problems, { holdChange: new Promise<void>((r) => (release = r)) });
    await openBook(api);
    await press('Problem 3 show translation', () => item('Problem 3'));
    await press('Problem 3 translate', panel('Problem 3'));
    await expectText(/Translating/, panel('Problem 3'));
    expect(within(panel('Problem 3')()).getByRole('button')).toBeDisabled();
    release();
    await expectText(/Translated/, panel('Problem 3'));
    expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });
});
