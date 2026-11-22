import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { searchPath } from './keyword';
import { Keywords } from './keywords';
import { type Answer, fakeApi, type Sent } from './test/fake-api';
import { render } from './test/render';

type Keyword = { id: number; date: string; keyword: string; memo: string };

const today = '2026-10-23';

type Options = {
  // Every keyword request with this method answers this error instead.
  reject?: { method: string; status: number; error: string };
  // Changes (non-GET keyword requests) wait for this promise.
  holdChange?: Promise<void>;
};

// In-memory keywords API. Search matches keyword or memo.
function server(initial: Keyword[] = [], options: Options = {}) {
  const rows = initial.map((row) => ({ ...row }));
  let nextId = 100;
  const answer = ({ method, path, body: sent }: Sent): Answer | undefined => {
    const body = sent as { date?: string; keyword: string; memo: string } | undefined;
    if (options.reject?.method === method)
      return { status: options.reject.status, body: { error: options.reject.error } };
    const [base, query = ''] = path.split('?');
    if (base === '/api/keywords' && method === 'GET') {
      const params = new URLSearchParams(query);
      const date = params.get('date');
      if (date) return { body: { keywords: rows.filter((r) => r.date === date) } };
      const q = (params.get('q') ?? '').toLowerCase();
      const from = params.get('from') ?? '0000';
      const to = params.get('to') ?? '9999';
      return {
        body: {
          keywords: rows
            .filter(
              (r) =>
                (r.keyword.toLowerCase().includes(q) || r.memo.toLowerCase().includes(q)) &&
                r.date >= from &&
                r.date <= to,
            )
            .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id - b.id)),
        },
      };
    }
    const clash = (date: string, keyword: string, id?: number) =>
      rows.some(
        (r) => r.id !== id && r.date === date && r.keyword.toLowerCase() === keyword.toLowerCase(),
      );
    if (base === '/api/keywords' && method === 'POST' && body) {
      const row = {
        id: nextId++,
        date: body.date ?? today,
        keyword: body.keyword,
        memo: body.memo,
      };
      if (clash(row.date, row.keyword))
        return { status: 409, body: { error: 'This keyword already exists on this date' } };
      rows.push(row);
      return { status: 201, body: { keyword: row } };
    }
    const one = base.match(/^\/api\/keywords\/(\d+)$/);
    if (!one) return undefined;
    const index = rows.findIndex((r) => r.id === Number(one[1]));
    if (index < 0) return { status: 404, body: { error: 'Keyword not found' } };
    if (method === 'PUT' && body) {
      if (clash(body.date ?? '', body.keyword, rows[index].id))
        return { status: 409, body: { error: 'This keyword already exists on this date' } };
      rows[index] = { ...rows[index], ...body };
      return { body: { keyword: rows[index] } };
    }
    rows.splice(index, 1);
    return { status: 204 };
  };
  // Changes (non-GET requests) wait for the held promise before they are applied and answered.
  const api = fakeApi(async (request) => {
    if (request.method !== 'GET') await options.holdChange;
    return answer(request);
  });
  return { requests: api.requests, rows };
}

const stored: Keyword[] = [
  { id: 1, date: today, keyword: '고유값', memo: 'Ax = λx' },
  { id: 2, date: today, keyword: '대각화', memo: '' },
  { id: 3, date: '2026-10-20', keyword: '행렬식', memo: '고유값 계산에 쓴다' },
];

const regionEl = (label: string) => screen.getByRole('region', { name: label });
const section = (label: string) => within(regionEl(label));
const entry = () => section('Keyword entry');
const searchCard = () => section('Keyword search');
const dayEl = (date = today) => regionEl(`Keywords for ${date}`);

// Each keyword of a list as "keyword:memo".
const listedIn = (scope: HTMLElement) =>
  Array.from(scope.querySelectorAll('li')).map(
    (li) =>
      (li.querySelector('.log-date')?.textContent ?? '') +
      ':' +
      (li.querySelector('.log-memo')?.textContent ?? ''),
  );
const expectListed = (expected: string[], date = today) =>
  waitFor(() => expect(listedIn(dayEl(date))).toEqual(expected));
const expectSearchListed = (expected: string[]) =>
  waitFor(() => expect(listedIn(regionEl('Keyword search'))).toEqual(expected));
const item = (keyword: string) => within(within(dayEl()).getByText(keyword).closest('li')!);
const editingForm = () => dayEl().querySelector('li.editing form')!;
const editing = () => within(dayEl().querySelector('li.editing') as HTMLElement);
const fillIn = (scope: ReturnType<typeof within>, label: string, value: string) =>
  fireEvent.change(scope.getByLabelText(label), { target: { value } });
const dateField = () => entry().getByLabelText<HTMLInputElement>('Date');
const submitEntry = () => fireEvent.submit(regionEl('Keyword entry').querySelector('form')!);
const submitSearch = () => fireEvent.submit(regionEl('Keyword search').querySelector('form')!);

// Records the ids of focused elements (an id with no element never records anything).
const recordFocus = () => {
  const focused: string[] = [];
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement) {
    focused.push(this.id);
  });
  return focused;
};

async function openKeywords(initial: Keyword[] = [], options: Options = {}) {
  const api = server(initial, options);
  render(<Keywords today={today} />);
  await screen.findByRole('region', { name: `Keywords for ${today}` });
  return api;
}

describe('keywords', () => {
  test("the page opens on today's keywords", async () => {
    const api = await openKeywords(stored);
    await expectListed(['고유값:Ax = λx', '대각화:']);
    expect(dateField().value).toBe(today);
    expect(dayEl()).toHaveTextContent(/Keywords for today \(2026-10-23\)/);
    expect(api.requests.map((r) => r.path)).toEqual([`/api/keywords?date=${today}`]);
  });

  test('a day without keywords says so', async () => {
    await openKeywords();
    expect(
      await section(`Keywords for ${today}`).findByText(/No keywords on this date/),
    ).toBeInTheDocument();
  });

  test('quick add saves to the picked date, clears the form and refocuses', async () => {
    const focused = recordFocus();
    const api = await openKeywords();
    fillIn(entry(), 'Keyword', '고유벡터');
    fillIn(entry(), 'Memo (optional)', 'λ에 대응하는 벡터');
    submitEntry();
    await expectListed(['고유벡터:λ에 대응하는 벡터']);
    expect(api.requests.find((r) => r.method === 'POST')).toEqual({
      method: 'POST',
      path: '/api/keywords',
      body: { date: today, keyword: '고유벡터', memo: 'λ에 대응하는 벡터' },
    });
    expect(entry().getByLabelText('Keyword')).toHaveValue('');
    expect(entry().getByLabelText('Memo (optional)')).toHaveValue('');
    expect(regionEl('Keyword entry')).toHaveTextContent(/Added/);
    await waitFor(() => expect(focused).toEqual(['keyword-input']));
  });

  test('picking another date lists and adds for that date, and Back to today comes back', async () => {
    const api = await openKeywords(stored);
    fillIn(entry(), 'Date', '2026-10-20');
    await expectListed(['행렬식:고유값 계산에 쓴다'], '2026-10-20');
    fillIn(entry(), 'Keyword', '여인수');
    submitEntry();
    await expectListed(['행렬식:고유값 계산에 쓴다', '여인수:'], '2026-10-20');
    expect(api.rows.at(-1)?.date).toBe('2026-10-20');
    fireEvent.click(screen.getByRole('button', { name: 'Back to today' }));
    await expectListed(['고유값:Ax = λx', '대각화:']);
    expect(dateField().value).toBe(today);
  });

  test('a duplicate keyword shows the server message and keeps the input', async () => {
    await openKeywords(stored);
    await expectListed(['고유값:Ax = λx', '대각화:']);
    fillIn(entry(), 'Keyword', '고유값');
    submitEntry();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /This keyword already exists on this date/,
    );
    expect(entry().getByLabelText('Keyword')).toHaveValue('고유값');
  });

  test('editing replaces the keyword, and moving it to another date says where', async () => {
    const api = await openKeywords(stored);
    await expectListed(['고유값:Ax = λx', '대각화:']);
    fireEvent.click(item('대각화').getByRole('button', { name: '대각화 edit' }));
    fillIn(editing(), 'Memo', '대각 행렬로 바꾸기');
    fireEvent.submit(editingForm());
    await expectListed(['고유값:Ax = λx', '대각화:대각 행렬로 바꾸기']);
    expect(api.requests.find((r) => r.method === 'PUT')?.body).toEqual({
      date: today,
      keyword: '대각화',
      memo: '대각 행렬로 바꾸기',
    });
    expect(regionEl('Keyword entry')).toHaveTextContent(/Updated/);

    fireEvent.click(item('고유값').getByRole('button', { name: '고유값 edit' }));
    fillIn(editing(), 'Date', '2026-10-21');
    fireEvent.submit(editingForm());
    await expectListed(['대각화:대각 행렬로 바꾸기']);
    expect(regionEl('Keyword entry')).toHaveTextContent(/Updated and moved to 2026-10-21/);
  });

  test('deleting needs a confirmation', async () => {
    const api = await openKeywords(stored);
    await expectListed(['고유값:Ax = λx', '대각화:']);
    fireEvent.click(item('고유값').getByRole('button', { name: '고유값 delete' }));
    fireEvent.click(await screen.findByRole('button', { name: '고유값 cancel deletion' }));
    expect(api.requests.filter((r) => r.method === 'DELETE')).toHaveLength(0);
    fireEvent.click(await screen.findByRole('button', { name: '고유값 delete' }));
    fireEvent.click(await screen.findByRole('button', { name: '고유값 confirm deletion' }));
    await expectListed(['대각화:']);
    expect(api.requests.filter((r) => r.method === 'DELETE').map((r) => r.path)).toEqual([
      '/api/keywords/1',
    ]);
    expect(regionEl('Keyword entry')).toHaveTextContent(/Deleted/);
  });

  test('saving an edit of a keyword deleted elsewhere closes the editor', async () => {
    const focused = recordFocus();
    const api = await openKeywords(stored);
    await expectListed(['고유값:Ax = λx', '대각화:']);
    fireEvent.click(item('대각화').getByRole('button', { name: '대각화 edit' }));
    api.rows.splice(1, 1);
    fireEvent.submit(editingForm());
    expect(await screen.findByRole('alert')).toHaveTextContent(/Keyword not found/);
    await expectListed(['고유값:Ax = λx']);
    expect(dayEl().querySelector('li.editing')).toBeNull();
    // Edit focused the form (#280); the closed editor's buttons are gone, so focus goes to the day
    // heading.
    await waitFor(() => expect(focused).toEqual(['keyword-edit-keyword', 'keyword-day']));
  });

  test('search lists matches across dates and a date opens that day', async () => {
    const api = await openKeywords(stored);
    fillIn(searchCard(), 'Search term', ' 고유값 ');
    fillIn(searchCard(), 'Start date', '2026-10-01');
    submitSearch();
    expect(await searchCard().findByText(/Found 2/)).toBeInTheDocument();
    expect(api.requests.at(-1)?.path).toBe(
      '/api/keywords?q=%EA%B3%A0%EC%9C%A0%EA%B0%92&from=2026-10-01',
    );
    // Newest date first; a memo match counts too.
    await expectSearchListed(['고유값:Ax = λx', '행렬식:고유값 계산에 쓴다']);
    fireEvent.click(searchCard().getByRole('button', { name: 'View 행렬식 on 2026-10-20' }));
    await expectListed(['행렬식:고유값 계산에 쓴다'], '2026-10-20');
    expect(dateField().value).toBe('2026-10-20');

    fillIn(searchCard(), 'Search term', '없는말');
    submitSearch();
    expect(await searchCard().findByText(/No results/)).toBeInTheDocument();
  });

  test('changes refresh the shown search results', async () => {
    await openKeywords(stored);
    fillIn(searchCard(), 'Search term', '고유');
    submitSearch();
    await waitFor(() => expect(listedIn(regionEl('Keyword search'))).toHaveLength(2));
    fillIn(entry(), 'Keyword', '고유벡터');
    submitEntry();
    await expectSearchListed(['고유값:Ax = λx', '고유벡터:', '행렬식:고유값 계산에 쓴다']);
  });

  test('controls are locked while a change is pending', async () => {
    let release = () => {};
    await openKeywords(stored, { holdChange: new Promise<void>((r) => (release = r)) });
    await expectListed(['고유값:Ax = λx', '대각화:']);
    fireEvent.click(item('고유값').getByRole('button', { name: '고유값 delete' }));
    fireEvent.click(await screen.findByRole('button', { name: '고유값 confirm deletion' }));
    await waitFor(() => {
      const controls = Array.from(
        document.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
          '.keywords button, .keywords input',
        ),
      );
      expect(controls.length).toBeGreaterThan(0);
      expect(controls.every((n) => n.disabled)).toBe(true);
    });
    release();
    await expectListed(['대각화:']);
  });

  test('failed loads are reported instead of claiming there is nothing', async () => {
    await openKeywords(stored, { reject: { method: 'GET', status: 500, error: 'Server error' } });
    expect(
      await section(`Keywords for ${today}`).findByText(
        /Could not load the keywords: Server error/,
      ),
    ).toBeInTheDocument();
    expect(dayEl()).not.toHaveTextContent(/No keywords on this date/);
    submitSearch();
    expect(await searchCard().findByText(/Could not search: Server error/)).toBeInTheDocument();
  });

  test('keyword buttons name the keyword they act on', async () => {
    await openKeywords([stored[1]]);
    await expectListed(['대각화:']);
    const labels = Array.from(dayEl().querySelectorAll('button[aria-label]')).map((n) =>
      n.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['대각화 edit', '대각화 delete']);
  });

  test('the search request leaves out blank fields', () => {
    expect(searchPath({ q: '  ', from: '', to: '' })).toBe('/api/keywords');
    expect(searchPath({ q: '50%', from: '', to: '2026-10-31' })).toBe(
      '/api/keywords?q=50%25&to=2026-10-31',
    );
  });

  test('clearing the date field keeps the last picked date', async () => {
    await openKeywords(stored);
    await expectListed(['고유값:Ax = λx', '대각화:']);
    fillIn(entry(), 'Date', '');
    expect(dateField().value).toBe(today);
    expect(listedIn(dayEl())).toEqual(['고유값:Ax = λx', '대각화:']);
  });

  test('a failed search is not brought back by a later change', async () => {
    const options: Options = {};
    const api = await openKeywords(stored, options);
    fillIn(searchCard(), 'Search term', '고유');
    submitSearch();
    await waitFor(() => expect(listedIn(regionEl('Keyword search'))).toHaveLength(2));
    fillIn(searchCard(), 'Search term', '행렬');
    options.reject = { method: 'GET', status: 500, error: 'Server error' };
    submitSearch();
    expect(await searchCard().findByText(/Could not search/)).toBeInTheDocument();
    options.reject = undefined;
    fillIn(entry(), 'Keyword', '여인수');
    submitEntry();
    await expectListed(['고유값:Ax = λx', '대각화:', '여인수:']);
    // No results of the old "고유" search under the "행렬" query.
    expect(listedIn(regionEl('Keyword search'))).toEqual([]);
    // The failed search is not re-run.
    expect(api.requests.filter((r) => r.path.includes('q='))).toHaveLength(2);
  });

  test('the search dates cannot cross', async () => {
    await openKeywords();
    fillIn(searchCard(), 'Start date', '2026-10-10');
    fillIn(searchCard(), 'End date', '2026-10-20');
    expect(searchCard().getByLabelText('Start date')).toHaveAttribute('max', '2026-10-20');
    expect(searchCard().getByLabelText('End date')).toHaveAttribute('min', '2026-10-10');
  });

  test('after an edit, a cancel or a delete the day heading takes focus', async () => {
    const focused = recordFocus();
    await openKeywords(stored);
    await expectListed(['고유값:Ax = λx', '대각화:']);
    fireEvent.click(item('대각화').getByRole('button', { name: '대각화 edit' }));
    fireEvent.submit(editingForm());
    // Each Edit puts focus in the form (#280), then save or cancel moves it to the heading.
    await waitFor(() => expect(focused).toEqual(['keyword-edit-keyword', 'keyword-day']));
    await waitFor(() => expect(dayEl().querySelector('li.editing')).toBeNull());
    fireEvent.click(await screen.findByRole('button', { name: '대각화 edit' }));
    fireEvent.click(editing().getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(focused).toEqual([
        'keyword-edit-keyword',
        'keyword-day',
        'keyword-edit-keyword',
        'keyword-day',
      ]),
    );
    fireEvent.click(await screen.findByRole('button', { name: '대각화 delete' }));
    fireEvent.click(await screen.findByRole('button', { name: '대각화 confirm deletion' }));
    // Save, cancel, then the delete flow: its confirm button and the heading after (#86).
    await waitFor(() =>
      expect(focused).toEqual([
        'keyword-edit-keyword',
        'keyword-day',
        'keyword-edit-keyword',
        'keyword-day',
        'keyword-delete-confirm-2',
        'keyword-day',
      ]),
    );
  });

  // #75: two submits in the same tick, before the screen re-renders with `busy`, send one request.
  test('a double submit in the same tick adds the keyword once', async () => {
    const api = await openKeywords();
    fillIn(entry(), 'Keyword', '고유값');
    const form = regionEl('Keyword entry').querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await expectListed(['고유값:']);
    expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    // The second submit did not get a 409 for the same keyword either.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('keyword delete focus: back on cancel and on a failure, heading on 404', async () => {
    const options: Options = {};
    const focused = recordFocus();
    const api = await openKeywords(stored, options);
    await expectListed(['고유값:Ax = λx', '대각화:']);
    // Clicks the button with this accessible name, once it is there and enabled.
    const press = async (name: string) => {
      const button = await screen.findByRole('button', { name });
      await waitFor(() => expect(button).toBeEnabled());
      fireEvent.click(button);
    };
    const lastFocus = (id: string) => waitFor(() => expect(focused.at(-1)).toBe(id));
    await press('대각화 delete');
    await lastFocus('keyword-delete-confirm-2');
    await press('대각화 cancel deletion');
    await lastFocus('keyword-delete-2');
    options.reject = { method: 'DELETE', status: 500, error: 'Server error' };
    await press('대각화 delete');
    await press('대각화 confirm deletion');
    await screen.findByRole('alert');
    await lastFocus('keyword-delete-2');
    options.reject = undefined;
    api.rows.splice(1, 1);
    await press('대각화 delete');
    await press('대각화 confirm deletion');
    await lastFocus('keyword-day');
  });
});
