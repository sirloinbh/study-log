import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';

import { studyLogSearchPath } from './study-logs-data';
import { type Api, fakeApi } from './test/fake-api';
import { render } from './test/render';
import { StudyLogScreen } from './test/study-log-screen';

type Log = {
  id: number;
  studyDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  memo: string;
  difficulties: string;
  status: string;
  textbookId: number | null;
  textbookTitle: string | null;
  contentId: null;
  contentNumber: null;
  contentTitle: null;
  understanding: null;
  goalAchieved: null;
};

const log = (
  id: number,
  studyDate: string,
  memo: string,
  difficulties = '',
  book?: number,
): Log => ({
  id,
  studyDate,
  startTime: '09:00',
  endTime: '10:00',
  durationMinutes: 60,
  memo,
  difficulties,
  status: 'done',
  textbookId: book ?? null,
  textbookTitle: book ? '선형대수' : null,
  contentId: null,
  contentNumber: null,
  contentTitle: null,
  understanding: null,
  goalAchieved: null,
});

const stored = [
  log(1, '2026-10-20', '고유값 정리', '', 1),
  log(2, '2026-10-12', '미적분', '고유벡터가 어려움'),
  log(3, '2026-09-01', '행렬'),
];

// The study log API filtering like the server.
function server(initial: Log[], options: { failSearch?: boolean } = {}) {
  const logs = [...initial];
  return fakeApi(({ method, path }) => {
    if (path === '/api/textbooks')
      return { body: { textbooks: [{ id: 1, title: '선형대수', author: '', edition: '' }] } };
    if (path.startsWith('/api/study-logs/calendar'))
      return { body: { month: '2026-10', days: [] } };
    const removed = path.match(/^\/api\/study-logs\/(\d+)$/);
    if (removed && method === 'DELETE') {
      logs.splice(
        logs.findIndex((l) => l.id === Number(removed[1])),
        1,
      );
      return { status: 204 };
    }
    const [base, query = ''] = path.split('?');
    if (base !== '/api/study-logs') return undefined;
    const params = Object.fromEntries(
      query
        .split('&')
        .filter(Boolean)
        .map((pair) => pair.split('=').map(decodeURIComponent)),
    );
    if (params.limit === '100' && options.failSearch)
      return { status: 500, body: { error: 'Server error' } };
    const words = (params.q ?? '').toLowerCase();
    const found = logs.filter(
      (l) =>
        (!params.date || l.studyDate === params.date) &&
        (!words || l.memo.toLowerCase().includes(words) || l.difficulties.includes(words)) &&
        (!params.from || l.studyDate >= params.from) &&
        (!params.to || l.studyDate <= params.to) &&
        (!params.textbookId || l.textbookId === Number(params.textbookId)),
    );
    return { body: { studyLogs: found } };
  });
}

// The search requests: those with a limit of 100, which only the search card asks for.
const searchesOf = (api: Api) =>
  api.requests.filter((r) => r.path.includes('limit=100')).map((r) => r.path);

const card = () => screen.getByRole('region', { name: 'Study log search' });
const results = () =>
  Array.from(card().querySelectorAll('.search-results > li')).map((li) => li.textContent ?? '');
const fillIn = (label: string, value: string) =>
  fireEvent.change(within(card()).getByLabelText(label), { target: { value } });
const search = () => fireEvent.submit(card().querySelector('form')!);

async function open(...args: Parameters<typeof server>) {
  const api = server(...args);
  render(<StudyLogScreen today="2026-10-22" />);
  await within(card()).findByRole('option', { name: '선형대수' });
  return api;
}

test('a search asks with every filled condition and lists the matches', async () => {
  const api = await open(stored);
  fillIn('Search term', ' 고유 ');
  fillIn('Start date', '2026-10-01');
  search();
  expect(await within(card()).findByText('Found 2')).toBeInTheDocument();
  expect(searchesOf(api)).toEqual([
    '/api/study-logs?q=%EA%B3%A0%EC%9C%A0&from=2026-10-01&limit=100',
  ]);
  const found = results();
  expect(found).toHaveLength(2);
  expect(found[0]).toMatch(/2026-10-20.*1 h.*Done.*선형대수.*고유값 정리/s);
  expect(found[1]).toMatch(/Difficult parts: 고유벡터가 어려움/);
});

test('the textbook condition narrows the search', async () => {
  const api = await open(stored);
  const select = within(card()).getByLabelText('Textbook');
  expect(
    within(select)
      .getAllByRole('option')
      .map((n) => n.textContent),
  ).toEqual(['All', '선형대수']);
  fillIn('Textbook', '1');
  search();
  await waitFor(() => expect(results()).toHaveLength(1));
  expect(searchesOf(api).at(-1)).toBe('/api/study-logs?textbookId=1&limit=100');
});

test('no match says so and a failed search is reported without old results', async () => {
  await open(stored);
  fillIn('Search term', '없는말');
  search();
  expect(await within(card()).findByText('No results')).toBeInTheDocument();

  cleanup();
  await open(stored, { failSearch: true });
  search();
  expect(await within(card()).findByText(/Could not search: Server error/)).toBeInTheDocument();
  expect(results()).toHaveLength(0);
});

test('deleting a log on the History page searches the shown results again', async () => {
  const api = await open(stored);
  fillIn('Search term', '고유');
  search();
  await waitFor(() => expect(results()).toHaveLength(2));
  fireEvent.click(screen.getByRole('button', { name: /Delete log: 2026-10-20/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(results()).toHaveLength(1));
  expect(searchesOf(api)).toHaveLength(2);
});

test('the search request leaves out blank conditions', () => {
  expect(studyLogSearchPath({ q: '  ', from: '', to: '', textbookId: '' })).toBe(
    '/api/study-logs?limit=100',
  );
  expect(studyLogSearchPath({ q: '50%', from: '', to: '2026-10-31', textbookId: '3' })).toBe(
    '/api/study-logs?q=50%25&to=2026-10-31&textbookId=3&limit=100',
  );
});
