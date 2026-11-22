import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { textbookMeta } from './textbook';
import { Textbooks } from './textbooks';

// The whole page renders in each test and role queries are slow on the first run after a change.
vi.setConfig({ testTimeout: 20_000 });

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
  const reply = (status: number, body?: unknown) =>
    new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status });
  const fetch = async (path: string, init: { method?: string; body?: string } = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    // The selected textbook's cards (tested in textbook-contents.test.tsx and screens.test.tsx).
    if (path.endsWith('/contents')) return reply(200, { contents: [] });
    if (path.includes('/exercises')) return reply(200, { exercises: [] });
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
  vi.stubGlobal('fetch', vi.fn(fetch));
  return { requests, books };
}

const linear: Book = {
  id: 1,
  title: '선형대수와 그 응용',
  author: 'Gilbert Strang',
  edition: '4판',
};
const calculus: Book = { id: 2, title: '미적분학', author: '', edition: '' };

// Renders the Textbooks page once its first list load has finished.
async function open() {
  render(<Textbooks />);
  await waitFor(() =>
    expect(screen.queryByRole('group', { name: 'Loading the textbooks' })).toBeNull(),
  );
}

const click = (name: string, scope: Pick<typeof screen, 'getByRole'> = screen) =>
  fireEvent.click(scope.getByRole('button', { name }));
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label).value;
const form = () => document.querySelector('form')!;
const submit = () => fireEvent.submit(form());
// The register/edit card, the textbook list card and the detail card.
const formCard = () => within(form().closest('section')!);
const detail = () => within(screen.getByRole('region', { name: 'Textbook details' }));
const items = () =>
  within(screen.getByRole('heading', { name: 'Textbook list' }).closest('section')!).queryAllByRole(
    'listitem',
  );
const heading = () =>
  screen.getByRole('heading', { name: /^(Register a textbook|Edit the textbook)$/ }).textContent;
const calls = (api: { requests: { method: string; path: string }[] }, method: string) =>
  api.requests.filter((request) => request.method === method);
const choose = async (title: string) => {
  fireEvent.click(await screen.findByRole('button', { name: title }));
};
const CHOOSE = /Choose a textbook from the list/;

test('the textbook page lists titles with author and edition', async () => {
  const api = fakeApi([linear, calculus]);
  await open();
  expect(api.requests).toEqual([{ method: 'GET', path: '/api/textbooks' }]);
  // Server order (by title); a blank author and edition show nothing extra.
  expect(items().map((item) => item.textContent)).toEqual([
    '미적분학',
    '선형대수와 그 응용Gilbert Strang · 4판',
  ]);
  expect(detail().getByText(CHOOSE)).toBeInTheDocument();
});

test('an empty textbook list says so', async () => {
  fakeApi();
  await open();
  expect(screen.getByText('No textbooks registered yet')).toBeInTheDocument();
  expect(items()).toHaveLength(0);
});

test('registering a textbook posts it, clears the form and shows its detail', async () => {
  const api = fakeApi();
  await open();
  expect(heading()).toBe('Register a textbook');
  fill('Title', '확률과 통계');
  fill('Author', '홍길동');
  fill('Edition', '2판');
  submit();

  expect(await formCard().findByText('Registered')).toBeInTheDocument();
  expect(api.requests[1]).toEqual({
    method: 'POST',
    path: '/api/textbooks',
    body: { title: '확률과 통계', author: '홍길동', edition: '2판' },
  });
  // The list is reloaded from the server after saving.
  expect(api.requests[2].method).toBe('GET');
  await waitFor(() => expect(items()[0]).toHaveTextContent(/확률과 통계홍길동 · 2판/));
  expect(field('Title')).toBe('');
  expect(field('Author')).toBe('');
  expect(field('Edition')).toBe('');
  await waitFor(() =>
    expect(detail().getByText('Title').closest('dl')).toHaveTextContent(
      /Title확률과 통계Author홍길동Edition2판/,
    ),
  );
});

test('a rejected save shows the server message and keeps the input', async () => {
  fakeApi([], { reject: { status: 400, error: 'Enter the title' } });
  await open();
  fill('Title', '   ');
  fill('Author', '홍길동');
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(/Enter the title/);
  expect(field('Author')).toBe('홍길동');
});

test('selecting a textbook shows its detail with blanks marked', async () => {
  fakeApi([linear, calculus]);
  await open();
  await choose('미적분학');
  expect(detail().getByText('Title').closest('dl')).toHaveTextContent(
    /Title미적분학Author—Edition—/,
  );
  expect(screen.getByRole('button', { name: '미적분학', current: true })).toBeInTheDocument();
  expect(document.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
  await choose('선형대수와 그 응용');
  expect(detail().getByText('Author').closest('dl')).toHaveTextContent(
    /AuthorGilbert StrangEdition4판/,
  );
});

test('editing from the detail fills the form and saves it with PUT', async () => {
  const api = fakeApi([linear]);
  await open();
  await choose('선형대수와 그 응용');
  click('선형대수와 그 응용 textbook edit', detail());
  expect(heading()).toBe('Edit the textbook');
  expect(field('Title')).toBe('선형대수와 그 응용');
  expect(field('Author')).toBe('Gilbert Strang');
  fill('Edition', '5판');
  submit();

  expect(await formCard().findByText('Updated')).toBeInTheDocument();
  expect(calls(api, 'PUT')).toEqual([
    {
      method: 'PUT',
      path: '/api/textbooks/1',
      body: { title: '선형대수와 그 응용', author: 'Gilbert Strang', edition: '5판' },
    },
  ]);
  await waitFor(() => expect(items()[0]).toHaveTextContent(/Gilbert Strang · 5판/));
  await waitFor(() =>
    expect(detail().getByText('Edition').closest('dl')).toHaveTextContent(/Edition5판/),
  );
  expect(heading()).toBe('Register a textbook');
  expect(field('Title')).toBe('');
});

test('cancelling an edit restores the unsaved new textbook', async () => {
  fakeApi([linear]);
  await open();
  fill('Title', '작성 중인 교재');
  await choose('선형대수와 그 응용');
  click('선형대수와 그 응용 textbook edit', detail());
  expect(field('Title')).toBe('선형대수와 그 응용');
  click('Cancel', formCard());
  expect(heading()).toBe('Register a textbook');
  expect(field('Title')).toBe('작성 중인 교재');
});

test('deleting needs a second click and can be cancelled', async () => {
  const api = fakeApi([linear]);
  await open();
  await choose('선형대수와 그 응용');
  click('선형대수와 그 응용 textbook delete', detail());
  click('선형대수와 그 응용 textbook cancel deletion', detail());
  expect(calls(api, 'DELETE')).toHaveLength(0);

  click('선형대수와 그 응용 textbook delete', detail());
  expect(calls(api, 'DELETE')).toHaveLength(0);
  click('선형대수와 그 응용 textbook confirm deletion');
  expect(await screen.findByText('Deleted')).toBeInTheDocument();
  expect(calls(api, 'DELETE').map((request) => request.path)).toEqual(['/api/textbooks/1']);
  await waitFor(() => expect(items()).toHaveLength(0));
  expect(detail().getByText(CHOOSE)).toBeInTheDocument();
});

test('deleting the textbook being edited ends the edit', async () => {
  fakeApi([linear]);
  await open();
  await choose('선형대수와 그 응용');
  click('선형대수와 그 응용 textbook edit', detail());
  click('선형대수와 그 응용 textbook delete', detail());
  click('선형대수와 그 응용 textbook confirm deletion');
  await screen.findByText('Deleted');
  expect(heading()).toBe('Register a textbook');
  expect(field('Title')).toBe('');
});

test('saving an edit of a textbook deleted elsewhere leaves edit mode and reloads', async () => {
  const api = fakeApi([linear]);
  await open();
  await choose('선형대수와 그 응용');
  click('선형대수와 그 응용 textbook edit', detail());
  api.books.splice(0, 1);
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(/Textbook not found/);
  expect(heading()).toBe('Register a textbook');
  await waitFor(() => expect(items()).toHaveLength(0));
  // The detail no longer shows the textbook that is gone.
  expect(detail().getByText(CHOOSE)).toBeInTheDocument();
});

test('a failed load reports the error instead of claiming there are no textbooks', async () => {
  fakeApi([linear], { failGet: () => true });
  render(<Textbooks />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /Could not load the textbooks: Server error/,
  );
  expect(screen.queryByText('No textbooks registered yet')).toBeNull();
});

test('fields and buttons are locked while a save is in flight', async () => {
  let release = () => {};
  const api = fakeApi([linear], { hold: new Promise<void>((r) => (release = r)) });
  await open();
  await choose('선형대수와 그 응용');
  fill('Title', '새 교재');
  submit();
  await waitFor(() => {
    for (const input of within(form()).getAllByRole('textbox')) expect(input).toBeDisabled();
  });
  expect(within(form()).getAllByRole('textbox')).toHaveLength(3);
  for (const name of [/Register/, /textbook edit$/, /textbook delete$/])
    expect(screen.getByRole('button', { name })).toBeDisabled();
  release();
  expect(await formCard().findByText('Registered')).toBeInTheDocument();
  expect(calls(api, 'POST')).toHaveLength(1);
});

test('detail buttons name the textbook they act on', async () => {
  fakeApi([linear]);
  await open();
  await choose('선형대수와 그 응용');
  const labels = within(screen.getByRole('region', { name: 'Textbook details' }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'));
  expect(labels).toEqual([
    '선형대수와 그 응용 textbook edit',
    '선형대수와 그 응용 textbook delete',
  ]);
});

// The old test went through the app shell, which remounted each page. The real app keeps pages
// mounted, so what stays testable here is that a fresh screen starts with an empty form.
test('leaving a page and coming back starts it fresh', async () => {
  fakeApi([linear]);
  const first = render(<Textbooks />);
  await waitFor(() =>
    expect(screen.queryByRole('group', { name: 'Loading the textbooks' })).toBeNull(),
  );
  expect(field('Title')).toBe('');
  fill('Title', '작성 중');
  first.unmount();
  await open();
  expect(field('Title')).toBe('');
});

test('selecting moves focus to the detail only when it is stacked below the list', async () => {
  for (const [narrow, expected] of [
    [false, []],
    [true, ['textbook-detail']],
  ] as const) {
    const focused: string[] = [];
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement) {
      focused.push(this.id);
    });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: narrow && query === '(max-width: 760px)',
    }));
    fakeApi([linear]);
    await open();
    await choose('선형대수와 그 응용');
    expect(focused, narrow ? 'phone width' : 'desktop width').toEqual(expected);
    cleanup();
    vi.restoreAllMocks();
  }
});

test('a 404 when deleting reports it, reloads and clears the detail', async () => {
  const api = fakeApi([linear]);
  await open();
  await choose('선형대수와 그 응용');
  click('선형대수와 그 응용 textbook delete', detail());
  // The textbook disappears on the server before the delete is confirmed here.
  api.books.splice(0, 1);
  click('선형대수와 그 응용 textbook confirm deletion');
  expect(await screen.findByRole('alert')).toHaveTextContent(/Textbook not found/);
  await waitFor(() => expect(items()).toHaveLength(0));
  expect(detail().getByText(CHOOSE)).toBeInTheDocument();
});

test('textbook meta joins author and edition and skips blanks', () => {
  const book = { title: 't', author: 'Author', edition: '3판' };
  expect(textbookMeta(book)).toBe('Author · 3판');
  expect(textbookMeta({ ...book, edition: '' })).toBe('Author');
  expect(textbookMeta({ ...book, author: ' ' })).toBe('3판');
  expect(textbookMeta({ ...book, author: '', edition: '' })).toBe('');
});

// #65: the focused delete button is swapped out at each step; focus follows the flow instead of
// dropping to the page. The focus is real: the element must exist and take it.
const focusedId = () => document.activeElement?.id;

test('focus follows the delete flow: confirm, back on cancel, the list after', async () => {
  fakeApi([linear]);
  await open();
  await choose('선형대수와 그 응용');
  click('선형대수와 그 응용 textbook delete', detail());
  await waitFor(() => expect(focusedId()).toBe('textbook-delete-confirm'));
  click('선형대수와 그 응용 textbook cancel deletion', detail());
  await waitFor(() => expect(focusedId()).toBe('textbook-delete'));
  click('선형대수와 그 응용 textbook delete', detail());
  await waitFor(() => expect(focusedId()).toBe('textbook-delete-confirm'));
  click('선형대수와 그 응용 textbook confirm deletion', detail());
  await waitFor(() => expect(focusedId()).toBe('textbook-list'));
  expect(document.activeElement).toHaveAttribute('tabindex', '-1');
});

test('a failed textbook delete puts focus back on delete, a 404 on the list', async () => {
  for (const [reject, target] of [
    [{ status: 500, error: 'Server error' }, 'textbook-delete'],
    [{ status: 404, error: 'Textbook not found' }, 'textbook-list'],
  ] as const) {
    fakeApi([linear], { reject });
    await open();
    await choose('선형대수와 그 응용');
    click('선형대수와 그 응용 textbook delete', detail());
    click('선형대수와 그 응용 textbook confirm deletion', detail());
    await screen.findByRole('alert');
    await waitFor(() => expect(focusedId(), String(reject.status)).toBe(target));
    cleanup();
  }
});

// #75: two submits in the same tick, before the screen re-renders with `busy`, send one request.
test('a double submit in the same tick registers the textbook once', async () => {
  const api = fakeApi();
  await open();
  fill('Title', '확률과 통계');
  act(() => {
    fireEvent.submit(form());
    fireEvent.submit(form());
  });
  await waitFor(() => expect(items()).toHaveLength(1));
  expect(calls(api, 'POST')).toHaveLength(1);
});
