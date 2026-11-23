import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { type Answer, fakeApi } from './test/fake-api';
import { render } from './test/render';
import { contentLabel } from './textbook';
import { TextbookContents } from './textbook-contents';

// A stand-in for PDF.js: `pdf.doc` is the document the next read opens. Set by `fakePdfjs`.
type PdfDoc = {
  outline: unknown[] | null;
  pages?: unknown[][];
  fail?: string;
  // The document opens only after this promise settles.
  hold?: Promise<void>;
};
type PdfStandIn = {
  doc: PdfDoc;
  seen: { opened: number[]; destroyed: number };
  GlobalWorkerOptions: { workerSrc?: string };
};
const pdf = vi.hoisted<PdfStandIn>(() => ({
  doc: { outline: null },
  seen: { opened: [], destroyed: 0 },
  GlobalWorkerOptions: {},
}));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: pdf.GlobalWorkerOptions,
  getDocument: ({ data }: { data: Uint8Array }) => {
    pdf.seen.opened.push(data.length);
    const doc = pdf.doc;
    return {
      promise: (doc.hold ?? Promise.resolve()).then(() => {
        if (doc.fail) throw new Error(doc.fail);
        return {
          numPages: doc.pages?.length ?? 0,
          getOutline: () => Promise.resolve(doc.outline),
          getPage: (n: number) =>
            Promise.resolve({
              getTextContent: () => Promise.resolve({ items: doc.pages![n - 1] }),
            }),
        };
      }),
      destroy: () => Promise.resolve(void pdf.seen.destroyed++),
    };
  },
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.mjs' }));

function fakePdfjs(doc: PdfDoc) {
  pdf.doc = doc;
  pdf.seen.opened = [];
  pdf.seen.destroyed = 0;
  pdf.GlobalWorkerOptions.workerSrc = undefined;
  return pdf;
}

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

// In-memory /api/textbooks/:id/contents on the shared fake, with the API's ordering rules. It is a
// handler function because the tree needs state (saved entries come back on reload).
function serve(initial: Row[] = [], options: Options = {}) {
  const rows = [...initial];
  let nextId = 100;
  let gets = 0;
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
  const api = fakeApi((request): Answer | undefined => {
    const { method, path } = request;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = request.body as any;
    const match = path.match(/^\/api\/textbooks\/(\d+)\/contents(?:\/(\w+))?$/);
    if (!match) return undefined;
    const textbookId = Number(match[1]);
    const target = match[2];
    if (method === 'GET') {
      const held = ++gets > 1 && options.holdReload ? { hold: options.holdReload } : {};
      return { body: { contents: treeOf(textbookId) }, ...held };
    }
    if (method === 'POST' && target === 'bulk') {
      if (options.rejectBulk)
        return { status: options.rejectBulk.status, body: { error: options.rejectBulk.error } };
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
      return { status: 201, body: { contents: treeOf(textbookId) } };
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
      return { status: 201, body: { content: row } };
    }
    if (target === 'order') {
      if (options.rejectOrder)
        return { status: options.rejectOrder.status, body: { error: options.rejectOrder.error } };
      // Rows are kept in sibling order, so reordering means moving them to the given order.
      const moved = body.ids.map((id: number) => rows.find((row) => row.id === id)!);
      const rest = rows.filter((row) => !body.ids.includes(row.id));
      rows.splice(0, rows.length, ...rest, ...moved);
      return { body: { contents: treeOf(textbookId) } };
    }
    const index = rows.findIndex((row) => row.id === Number(target));
    if (index < 0) return { status: 404, body: { error: 'Contents entry not found' } };
    if (method === 'PUT') {
      rows[index] = { ...rows[index], number: body.number, title: body.title };
      return { body: { content: rows[index] } };
    }
    if (options.rejectDelete)
      return { status: options.rejectDelete.status, body: { error: options.rejectDelete.error } };
    const gone = new Set([rows[index].id]);
    for (const row of rows) if (row.parentId !== null && gone.has(row.parentId)) gone.add(row.id);
    rows.splice(0, rows.length, ...rows.filter((row) => !gone.has(row.id)));
    return { status: 204 };
  });
  return { ...api, rows, options };
}

const outline: Row[] = [
  { id: 1, textbookId: 1, parentId: null, number: '1', title: '벡터' },
  { id: 2, textbookId: 1, parentId: 1, number: '1.1', title: '덧셈' },
  { id: 3, textbookId: 1, parentId: 1, number: '1.2', title: '내적' },
  { id: 4, textbookId: 1, parentId: null, number: '2', title: '행렬' },
  { id: 5, textbookId: 2, parentId: null, number: '', title: '극한' },
];

// Renders the contents card of a textbook once its tree has loaded.
async function openBook(textbookId = 1) {
  const view = render(<TextbookContents textbookId={textbookId} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add chapter' })).toBeEnabled());
  return view;
}

const card = () => document.querySelector<HTMLElement>('.contents')!;
const editorForm = () =>
  document.querySelector<HTMLFormElement>('form.content-form:not(.toc-paste)');
const pasteForm = () => document.querySelector<HTMLFormElement>('form.toc-paste');
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const field = (label: string) =>
  screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(label).value;
const calls = (
  api: { requests: { method: string; path: string; body?: unknown }[] },
  method: string,
) => api.requests.filter((request) => request.method === method);

// The tree as "1 벡터[1.1 덧셈|1.2 내적]|2 행렬", read from the rendered labels.
const shape = (list: Element | null | undefined): string => {
  if (!list) return '';
  return [...list.children]
    .map((item) => {
      const label = item.querySelector(':scope > .content-row > .content-label')!.textContent;
      const inner = shape(item.querySelector(':scope > ul.content-tree'));
      return inner ? `${label}[${inner}]` : label;
    })
    .join('|');
};
const treeShape = () => shape(card().querySelector(':scope > ul.content-tree'));
const previewShape = () =>
  shape(screen.getByRole('region', { name: 'Contents preview' }).querySelector('ul.content-tree'));
const row = (label: string) =>
  within(
    [...document.querySelectorAll<HTMLElement>('.content-row')].find(
      (element) => element.querySelector('.content-label')?.textContent === label,
    )!,
  );
// The buttons of a row are named for it; `action` is the end of that name.
const names = {
  up: /^Move up/,
  down: /^Move down/,
  child: /^Add child/,
  edit: /^Edit contents entry/,
  delete: /^Delete contents entry/,
};
// Clicks once the row's button is enabled (every button is locked while a request runs).
const press = async (label: string, action: keyof typeof names) => {
  await waitFor(() =>
    expect(row(label).getByRole('button', { name: names[action] })).toBeEnabled(),
  );
  fireEvent.click(row(label).getByRole('button', { name: names[action] }));
};
// Answers the delete dialog and waits for it to close, so the page behind it is readable again.
const answerDialog = async (name: 'Delete' | 'Cancel') => {
  fireEvent.click(await screen.findByRole('button', { name }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
};
const saveEditor = () => fireEvent.submit(editorForm()!);
const statusText = () => screen.getByRole('status').textContent;

test('selecting a textbook shows its contents as a tree', async () => {
  const api = serve(outline);
  const { rerender } = await openBook();
  expect(api.requests).toEqual([{ method: 'GET', path: '/api/textbooks/1/contents' }]);
  expect(treeShape()).toBe('1 벡터[1.1 덧셈|1.2 내적]|2 행렬');
  // Switching textbooks shows the other textbook's contents; a blank number shows only the title.
  rerender(<TextbookContents textbookId={2} />);
  await waitFor(() => expect(treeShape()).toBe('극한'));
});

test('a textbook without contents says so', async () => {
  serve();
  await openBook();
  expect(card()).toHaveTextContent(/No contents yet/);
});

test('adding a chapter and a section posts them and reloads the tree', async () => {
  const api = serve();
  await openBook();
  fireEvent.click(screen.getByRole('button', { name: 'Add chapter' }));
  expect(editorForm()).toHaveTextContent('Add chapter');
  fill('Number', '1');
  fill('Contents title', '벡터');
  saveEditor();
  expect(await screen.findByText('Added')).toBeInTheDocument();
  expect(api.requests[1]).toEqual({
    method: 'POST',
    path: '/api/textbooks/1/contents',
    body: { number: '1', title: '벡터', parentId: null },
  });
  await waitFor(() => expect(treeShape()).toBe('1 벡터'));
  // The editor closes after saving.
  expect(editorForm()).toBeNull();

  await press('1 벡터', 'child');
  expect(screen.getByText("Add under '1 벡터'")).toBeInTheDocument();
  fill('Number', '1.1');
  fill('Contents title', '덧셈');
  saveEditor();
  await waitFor(() => expect(treeShape()).toBe('1 벡터[1.1 덧셈]'));
  expect(calls(api, 'POST')[1].body).toEqual({ number: '1.1', title: '덧셈', parentId: 100 });
});

test('editing an entry saves its number and title with PUT', async () => {
  const api = serve(outline);
  await openBook();
  await press('1.2 내적', 'edit');
  expect(card()).toHaveTextContent(/Edit contents entry/);
  expect(field('Number')).toBe('1.2');
  expect(field('Contents title')).toBe('내적');
  fill('Contents title', '내적과 길이');
  saveEditor();
  expect(await screen.findByText('Updated')).toBeInTheDocument();
  expect(calls(api, 'PUT')).toEqual([
    {
      method: 'PUT',
      path: '/api/textbooks/1/contents/3',
      body: { number: '1.2', title: '내적과 길이' },
    },
  ]);
  await waitFor(() => expect(treeShape()).toBe('1 벡터[1.1 덧셈|1.2 내적과 길이]|2 행렬'));
});

test('moving an entry sends its siblings in the new order', async () => {
  const api = serve(outline);
  await openBook();
  // First and last siblings cannot move past the ends.
  expect(row('1 벡터').getByRole('button', { name: names.up })).toBeDisabled();
  expect(row('2 행렬').getByRole('button', { name: names.down })).toBeDisabled();
  expect(row('1.1 덧셈').getByRole('button', { name: names.down })).toBeEnabled();

  await press('1.1 덧셈', 'down');
  await waitFor(() => expect(treeShape()).toBe('1 벡터[1.2 내적|1.1 덧셈]|2 행렬'));
  expect(api.requests.at(-1)).toEqual({
    method: 'PUT',
    path: '/api/textbooks/1/contents/order',
    body: { parentId: 1, ids: [3, 2] },
  });
  await press('2 행렬', 'up');
  await waitFor(() => expect(treeShape()).toBe('2 행렬|1 벡터[1.2 내적|1.1 덧셈]'));
  expect(api.requests.at(-1)?.body).toEqual({ parentId: null, ids: [4, 1] });
});

test('deleting needs a confirmation and removes the entry with its sections', async () => {
  const api = serve(outline);
  await openBook();
  await press('1 벡터', 'delete');
  await answerDialog('Cancel');
  await press('1 벡터', 'delete');
  expect(calls(api, 'DELETE')).toHaveLength(0);
  await answerDialog('Delete');
  expect(await screen.findByText('Deleted')).toBeInTheDocument();
  expect(calls(api, 'DELETE').map((r) => r.path)).toEqual(['/api/textbooks/1/contents/1']);
  await waitFor(() => expect(treeShape()).toBe('2 행렬'));
});

test('a delete refused because study logs use the entry shows the server message', async () => {
  serve(outline, {
    rejectDelete: {
      status: 409,
      error: 'A contents entry with a study log or schedule attached cannot be deleted',
    },
  });
  await openBook();
  await press('2 행렬', 'edit');
  await press('1.2 내적', 'delete');
  await answerDialog('Delete');
  expect(await within(card()).findByRole('alert')).toHaveTextContent(
    /A contents entry with a study log or schedule attached cannot be deleted/,
  );
  expect(treeShape()).toBe('1 벡터[1.1 덧셈|1.2 내적]|2 행렬');
  // The edit of another entry stays open.
  expect(field('Contents title')).toBe('행렬');
});

test('saving an edit of an entry deleted elsewhere closes the editor and reloads', async () => {
  const api = serve(outline);
  await openBook();
  await press('2 행렬', 'edit');
  api.rows.splice(3, 1);
  saveEditor();
  expect(await within(card()).findByRole('alert')).toHaveTextContent(/Contents entry not found/);
  expect(editorForm()).toBeNull();
  await waitFor(() => expect(treeShape()).toBe('1 벡터[1.1 덧셈|1.2 내적]'));
});

test('switching textbooks closes an open editor of the previous one', async () => {
  serve(outline);
  const { rerender } = await openBook();
  await press('2 행렬', 'edit');
  expect(editorForm()).not.toBeNull();
  rerender(<TextbookContents textbookId={2} />);
  await waitFor(() => expect(treeShape()).toBe('극한'));
  expect(editorForm()).toBeNull();
});

test('row buttons name the entry they act on', async () => {
  serve([outline[4]]);
  await openBook(2);
  const labels = within(card())
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
    .filter((label) => label !== null);
  expect(labels).toEqual([
    'Move up: 극한',
    'Move down: 극한',
    'Add child: 극한',
    'Edit contents entry: 극한',
    'Delete contents entry: 극한',
  ]);
});

test('buttons stay locked until the tree is reloaded after a change', async () => {
  let release = () => {};
  serve(outline, { holdReload: new Promise<void>((r) => (release = r)) });
  await openBook();
  fireEvent.click(screen.getByRole('button', { name: 'Add chapter' }));
  fill('Number', '3');
  fill('Contents title', '행렬식');
  saveEditor();
  // Saved, but the reload is still pending: moving now would start from the old tree.
  await screen.findByText('Added');
  const moves = within(card())
    .getAllByRole('button')
    .filter((button) => ['Up', 'Down', 'Add chapter'].includes(button.textContent ?? ''));
  expect(moves.length > 0 && moves.every((button) => button.hasAttribute('disabled'))).toBe(true);
  release();
  await waitFor(() => expect(treeShape()).toBe('1 벡터[1.1 덧셈|1.2 내적]|2 행렬|3 행렬식'));
  await waitFor(() =>
    expect(row('3 행렬식').getByRole('button', { name: names.up })).toBeEnabled(),
  );
});

test('a refused reorder shows the server message and reloads the tree', async () => {
  const api = serve(outline, {
    rejectOrder: { status: 400, error: 'Send every entry under the same parent exactly once' },
  });
  await openBook();
  await press('1 벡터', 'down');
  expect(await within(card()).findByRole('alert')).toHaveTextContent(
    /Send every entry under the same parent exactly once/,
  );
  await waitFor(() => expect(api.requests.map((r) => r.method)).toEqual(['GET', 'PUT', 'GET']));
  expect(treeShape()).toBe('1 벡터[1.1 덧셈|1.2 내적]|2 행렬');
});

test('content labels show the number before the title when there is one', () => {
  expect(contentLabel({ number: '1.2', title: '내적' })).toBe('1.2 내적');
  expect(contentLabel({ number: ' ', title: '부록' })).toBe('부록');
});

// #75: two submits in the same tick, before the screen re-renders with `busy`, send one request.
test('a double submit in the same tick adds the chapter once', async () => {
  const api = serve();
  await openBook();
  fireEvent.click(screen.getByRole('button', { name: 'Add chapter' }));
  fill('Contents title', '벡터');
  act(() => {
    fireEvent.submit(editorForm()!);
    fireEvent.submit(editorForm()!);
  });
  await waitFor(() => expect(treeShape()).toBe('벡터'));
  expect(calls(api, 'POST')).toHaveLength(1);
});

// #86: the focus is real, so the element to focus must exist and take it.
const focusedId = () => document.activeElement?.id;

test('contents delete focus: confirm, back on cancel, button on failure, heading after', async () => {
  const api = serve(outline);
  await openBook();
  await press('2 행렬', 'delete');
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  await answerDialog('Cancel');
  await waitFor(() => expect(focusedId()).toBe('content-delete-4'));
  // Study logs still point at it: the entry stays with its delete button.
  api.options.rejectDelete = {
    status: 409,
    error: 'A contents entry with a study log or schedule attached cannot be deleted',
  };
  await press('2 행렬', 'delete');
  await answerDialog('Delete');
  await within(card()).findByRole('alert');
  await waitFor(() => expect(focusedId()).toBe('content-delete-4'));
  api.options.rejectDelete = undefined;
  await press('2 행렬', 'delete');
  await answerDialog('Delete');
  await waitFor(() => expect(treeShape()).toBe('1 벡터[1.1 덧셈|1.2 내적]'));
  await waitFor(() => expect(focusedId()).toBe('contents-heading'));
});

const previewRegion = () => screen.getByRole('region', { name: 'Contents preview' });
const saveButton = () => pasteForm()!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const openPaste = () => fireEvent.click(screen.getByRole('button', { name: 'Paste contents' }));

test('a pasted table of contents is previewed as a tree and saved at once (#23)', async () => {
  const api = serve(outline);
  await openBook();
  openPaste();
  expect(pasteForm()).not.toBeNull();
  expect(
    screen.queryByRole('region', { name: 'Contents preview' }),
    'no preview before any text',
  ).toBeNull();
  expect(saveButton(), 'nothing to save yet').toBeDisabled();

  fill('Contents text', '3 고유값 ....... 120\n3.1 특성방정식  125\n3.2 대각화\n4 이차형식');
  expect(previewShape()).toBe('3 고유값[3.1 특성방정식|3.2 대각화]|4 이차형식');
  expect(previewRegion()).toHaveTextContent(/Preview · 4 \(added after the existing contents\)/);
  expect(saveButton()).toHaveTextContent(/^Save 4$/);

  // Fixing the text fixes the preview.
  fill('Contents text', '3 고유값\n3.1 특성방정식\n4 이차형식');
  expect(previewShape()).toBe('3 고유값[3.1 특성방정식]|4 이차형식');
  fireEvent.submit(pasteForm()!);
  expect(await screen.findByText('Added 3 contents entries')).toBeInTheDocument();
  expect(api.requests.at(-1)).toEqual({
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
  expect(calls(api, 'GET')).toHaveLength(1);
  expect(pasteForm(), 'the form closes').toBeNull();
  expect(treeShape()).toBe('1 벡터[1.1 덧셈|1.2 내적]|2 행렬|3 고유값[3.1 특성방정식]|4 이차형식');
});

test('pasted text that cannot be saved says why and keeps the save locked', async () => {
  const api = serve();
  await openBook();
  openPaste();
  fill('Contents text', `1 벡터\n2 ${'가'.repeat(201)}`);
  expect(screen.getByRole('alert')).toHaveTextContent(/Line 2: the title is over 200 characters/);
  expect(saveButton()).toBeDisabled();
  // An empty textbook has nothing before.
  expect(previewRegion()).not.toHaveTextContent(/added after the existing contents/);
  fireEvent.submit(pasteForm()!);
  expect(calls(api, 'POST')).toHaveLength(0);
  // Cancelling closes the form; opening the chapter editor closes it too.
  fireEvent.click(within(pasteForm()!).getByRole('button', { name: 'Cancel' }));
  expect(pasteForm()).toBeNull();
  openPaste();
  fireEvent.click(screen.getByRole('button', { name: 'Add chapter' }));
  expect(pasteForm()).toBeNull();
});

test('a refused paste shows the server message and keeps the text', async () => {
  serve([], { rejectBulk: { status: 400, error: 'Contents can have at most 10 levels' } });
  await openBook();
  openPaste();
  fill('Contents text', '1 벡터');
  fireEvent.submit(pasteForm()!);
  expect(
    await within(card()).findByText(/Contents can have at most 10 levels/),
  ).toBeInTheDocument();
  expect(field('Contents text')).toBe('1 벡터');
});

const pdfFile = (size = 4) => ({ size, arrayBuffer: () => Promise.resolve(new ArrayBuffer(size)) });
const pickPdf = (file: unknown) => {
  const input = screen.getByLabelText('Import from PDF');
  // The picker is emptied so the same file can be picked again.
  const assigned: unknown[] = [];
  Object.defineProperty(input, 'value', {
    configurable: true,
    get: () => '',
    set: (v) => assigned.push(v),
  });
  fireEvent.change(input, { target: { files: [file] } });
  expect(assigned, 'cleared so the same file can be picked again').toEqual(['']);
};

test('a PDF with bookmarks fills the paste box with them, indented by level (#23)', async () => {
  const doc = fakePdfjs({
    outline: [
      { title: '1 벡터', items: [{ title: '1.1 내적', items: [] }] },
      { title: '2 행렬', items: [] },
    ],
  });
  serve();
  await openBook();
  openPaste();
  fill('Contents text', '지워질 글');
  pickPdf(pdfFile(4));
  expect(
    await screen.findByText(/Imported 3 contents lines from the PDF bookmarks/),
  ).toBeInTheDocument();
  expect(doc.seen.opened).toEqual([4]);
  expect(doc.GlobalWorkerOptions.workerSrc).toBe('/pdf.worker.mjs');
  expect(doc.seen.destroyed, 'the document is closed after reading').toBe(1);
  expect(field('Contents text')).toBe('1 벡터\n  1.1 내적\n2 행렬');
  expect(previewShape()).toBe('1 벡터[1.1 내적]|2 행렬');
});

test('a PDF without bookmarks gives the text of its first pages', async () => {
  const piece = (str: string, x: number, y: number) => ({
    str,
    transform: [10, 0, 0, 10, x, y],
    height: 10,
    width: str.length * 5,
  });
  fakePdfjs({
    outline: null,
    pages: [[piece('Contents', 50, 700)], [piece('1 벡터', 50, 700), piece('12', 300, 700)]],
  });
  serve();
  await openBook();
  openPaste();
  pickPdf(pdfFile());
  expect(
    await screen.findByText(/No bookmarks, so the text of the first 2 pages was imported/),
  ).toBeInTheDocument();
  expect(field('Contents text')).toBe('Contents\n1 벡터  12');
  expect(previewShape()).toBe('1 벡터');
});

test('an unreadable, empty or too large PDF says so and keeps the text', async () => {
  const broken = fakePdfjs({ outline: null, fail: 'Invalid PDF structure.' });
  serve();
  await openBook();
  openPaste();
  fill('Contents text', '1 벡터');
  pickPdf(pdfFile());
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /Could not read the PDF: Invalid PDF structure\./,
  );
  expect(broken.seen.destroyed).toBe(1);
  expect(field('Contents text')).toBe('1 벡터');
  cleanup();

  fakePdfjs({ outline: [], pages: [[]] });
  await openBook();
  openPaste();
  pickPdf(pdfFile());
  expect(await screen.findByRole('alert')).toHaveTextContent(/No text was found in the PDF/);
  cleanup();

  const big = fakePdfjs({ outline: [] });
  await openBook();
  openPaste();
  pickPdf(pdfFile(50 * 1024 * 1024 + 1));
  expect(await screen.findByRole('alert')).toHaveTextContent(/50 MB or less/);
  expect(big.seen.opened, 'not read at all').toEqual([]);
});

test('a PDF still being read is dropped when the box is closed or an editor opens', async () => {
  let release = () => {};
  const hold = new Promise<void>((resolve) => (release = resolve));
  const doc = fakePdfjs({ outline: [{ title: '1 벡터', items: [] }], hold });
  serve(outline);
  await openBook();
  openPaste();
  pickPdf(pdfFile());
  // While reading: announced, and the box and save are locked.
  await waitFor(() => expect(statusText()).toMatch(/Reading the PDF/));
  expect(screen.getByLabelText('Contents text'), 'box locked while reading').toBeDisabled();
  fireEvent.click(within(pasteForm()!).getByRole('button', { name: 'Cancel' }));
  expect(pasteForm()).toBeNull();
  expect(statusText(), 'the reading notice goes with the box').toBe('');
  release();
  await waitFor(() => expect(doc.seen.destroyed, 'the document is still closed').toBe(1));
  await act(async () => {});
  expect(pasteForm(), 'the late result does not reopen the box').toBeNull();
  expect(statusText()).toBe('');
  cleanup();

  // Opening the chapter editor during a read keeps only the editor.
  let releaseAgain = () => {};
  const again = fakePdfjs({
    outline: [{ title: '2 행렬', items: [] }],
    hold: new Promise<void>((resolve) => (releaseAgain = resolve)),
  });
  serve(outline);
  await openBook();
  openPaste();
  pickPdf(pdfFile());
  await waitFor(() => expect(statusText()).toMatch(/Reading the PDF/));
  fireEvent.click(screen.getByRole('button', { name: 'Add chapter' }));
  releaseAgain();
  await waitFor(() => expect(again.seen.destroyed).toBe(1));
  await act(async () => {});
  expect(pasteForm()).toBeNull();
  expect(document.querySelectorAll('form.content-form')).toHaveLength(1);
  expect(statusText()).not.toMatch(/Imported/);
});
