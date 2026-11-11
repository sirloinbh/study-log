import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { Exercises } from './exercises';
import { StudyLogs } from './study-logs';
import { fakeApi } from './test/fake-api';
import { TextbookContents } from './textbook-contents';
import { Textbooks } from './textbooks';

// The whole page renders in each test and role queries are slow on the first run after a change.
// The wait of `findBy` and `waitFor` is raised for all tests in test/setup.ts.
vi.setConfig({ testTimeout: 20_000 });

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const serverError = { status: 500, body: { error: 'A server error occurred' } };

describe('study logs', () => {
  const today = '2026-10-31';
  const log = {
    id: 1,
    studyDate: today,
    startTime: '09:00',
    endTime: '10:30',
    durationMinutes: 90,
    memo: '',
    status: 'done',
    textbookId: null,
    textbookTitle: null,
    contentId: null,
    contentNumber: null,
    contentTitle: null,
    understanding: null,
    difficulties: '',
    goalAchieved: null,
    studyType: 'new',
  };
  // The recent list's own card: the calendar below has a list of the same class.
  const recent = () => within(document.getElementById('study-log-list')!.closest('section')!);

  // A small server holding the logs, so saving and deleting show up in the reloaded list.
  function server(start: (typeof log)[], failWrites = false) {
    let logs = start;
    return fakeApi(({ method, path, body }) => {
      if (path.startsWith('/api/textbooks')) return { body: { textbooks: [] } };
      if (path.startsWith('/api/study-logs/calendar')) {
        const month = new URL(path, 'http://test').searchParams.get('month');
        return { body: { month, days: [{ date: `${month}-01`, minutes: 0, logs: 0 }] } };
      }
      if (method === 'GET') {
        const date = new URL(path, 'http://test').searchParams.get('date');
        return { body: { studyLogs: logs.filter((item) => !date || item.studyDate === date) } };
      }
      if (failWrites) return serverError;
      if (method === 'DELETE') {
        logs = logs.filter((item) => !path.endsWith(`/${item.id}`));
        return { status: 204 };
      }
      const saved = { ...log, ...(body as object), id: 2, durationMinutes: 60 };
      logs = [saved, ...logs];
      return { status: 201, body: { studyLog: saved } };
    });
  }

  test('the list shows each log with its time, length and status', async () => {
    server([log]);
    render(<StudyLogs today={today} />);
    await screen.findByRole('button', { name: /log delete$/ });
    expect(recent().getByText('09:00–10:30')).toBeInTheDocument();
    expect(recent().getByText('1 h 30 min')).toBeInTheDocument();
    expect(recent().getByText('Done')).toBeInTheDocument();
  });

  test('adding sends the form, reloads the list and keeps the date for the next one', async () => {
    const sent = server([]);
    render(<StudyLogs today={today} />);
    expect(await screen.findByText('No study logs yet')).toBeInTheDocument();
    fill('Study date', '2026-10-20');
    fill('Start', '13:00');
    fill('End', '14:00');
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(sent[0]).toMatchObject({
      method: 'POST',
      path: '/api/study-logs',
      body: { studyDate: '2026-10-20', startTime: '13:00', endTime: '14:00' },
    });
    expect(await recent().findByText('13:00–14:00')).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>('Start').value).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('Study date').value).toBe('2026-10-20');
  });

  test('deleting asks first, then the log leaves the list', async () => {
    const sent = server([log]);
    render(<StudyLogs today={today} />);
    fireEvent.click(await screen.findByRole('button', { name: /log delete$/ }));
    expect(sent).toEqual([]);
    fireEvent.click(await screen.findByRole('button', { name: /log confirm deletion$/ }));
    expect(await screen.findByText('No study logs yet')).toBeInTheDocument();
    expect(sent).toEqual([{ method: 'DELETE', path: '/api/study-logs/1' }]);
  });

  test('a refused save shows the server message and keeps what was typed', async () => {
    server([], true);
    render(<StudyLogs today={today} />);
    await screen.findByText('No study logs yet');
    fill('Start', '13:00');
    fill('End', '14:00');
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('A server error occurred');
    expect(screen.getByLabelText<HTMLInputElement>('Start').value).toBe('13:00');
  });

  test('a failed first load says so instead of claiming there are no logs', async () => {
    fakeApi(({ path }) =>
      path.startsWith('/api/textbooks') ? { body: { textbooks: [] } } : serverError,
    );
    render(<StudyLogs today={today} />);
    expect(
      await screen.findByText('Could not load the recent logs: A server error occurred'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No study logs yet')).toBeNull();
  });
});

describe('textbooks', () => {
  const book = { id: 1, title: '선형대수', author: '길버트', edition: '5판' };

  function server(start: (typeof book)[]) {
    let books = start;
    return fakeApi(({ method, path, body }) => {
      if (path.endsWith('/contents')) return { body: { contents: [] } };
      if (path.includes('/exercises')) return { body: { exercises: [] } };
      if (method === 'GET') return { body: { textbooks: books } };
      const saved = { ...(body as typeof book), id: 2 };
      books = [...books, saved];
      return { status: 201, body: { textbook: saved } };
    });
  }

  test('the list shows the textbooks and picking one opens its detail', async () => {
    server([book]);
    render(<Textbooks />);
    fireEvent.click(await screen.findByRole('button', { name: '선형대수' }));
    const detail = within(screen.getByRole('region', { name: 'Textbook details' }));
    expect(detail.getByText('길버트')).toBeInTheDocument();
    expect(detail.getByText('5판')).toBeInTheDocument();
    // The cards of the picked textbook open too.
    expect(
      await screen.findByText('Add contents first to enter problems by chapter and section'),
    ).toBeInTheDocument();
  });

  test('adding sends the form, lists the textbook and clears the form', async () => {
    const sent = server([]);
    render(<Textbooks />);
    expect(await screen.findByText('No textbooks registered yet')).toBeInTheDocument();
    fill('Title', '해석학');
    fill('Author', '루딘');
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText('Registered')).toBeInTheDocument();
    expect(sent[0]).toMatchObject({
      method: 'POST',
      path: '/api/textbooks',
      body: { title: '해석학', author: '루딘', edition: '' },
    });
    expect(await screen.findByRole('button', { name: '해석학' })).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>('Title').value).toBe('');
  });
});

describe('textbook contents', () => {
  const node = (id: number, number: string, title: string) => ({
    id,
    number,
    title,
    children: [],
  });

  test('moving an entry saves the new order of its siblings', async () => {
    const first = node(1, '1', '벡터');
    const second = node(2, '2', '행렬');
    const sent = fakeApi(({ method }) =>
      method === 'PUT'
        ? { body: { contents: [second, first] } }
        : { body: { contents: [first, second] } },
    );
    render(<TextbookContents textbookId={7} />);
    fireEvent.click(await screen.findByRole('button', { name: /행렬 move up$/ }));
    await waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0]).toEqual({
      method: 'PUT',
      path: '/api/textbooks/7/contents/order',
      body: { parentId: null, ids: [2, 1] },
    });
    // The answered order is shown. Checked after the buttons are back: they are all disabled while
    // the save runs.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /벡터 move up$/ })).toBeEnabled(),
    );
    expect(
      [...document.querySelectorAll('.content-label')].map((label) => label.textContent),
    ).toEqual(['2 행렬', '1 벡터']);
    expect(screen.getByRole('button', { name: /행렬 move up$/ })).toBeDisabled();
  });

  test('a refused move shows the server message', async () => {
    const first = node(1, '1', '벡터');
    const second = node(2, '2', '행렬');
    fakeApi(({ method }) =>
      method === 'PUT' ? serverError : { body: { contents: [first, second] } },
    );
    render(<TextbookContents textbookId={7} />);
    fireEvent.click(await screen.findByRole('button', { name: /행렬 move up$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A server error occurred');
  });
});

describe('exercises', () => {
  const textbook = { id: 7, title: '선형대수', author: '', edition: '' };
  const chapter = { id: 3, number: '1', title: '벡터', children: [] };
  const exercise = {
    id: 5,
    textbookId: 7,
    contentId: 3,
    number: '1',
    body: '내적을 구하라',
    important: false,
  };
  const url = '/api/textbooks/7/contents/3/exercises';

  function server(start: (typeof exercise)[]) {
    let exercises = start;
    return fakeApi(({ method, path, body }) => {
      if (method === 'GET') return { body: { exercises } };
      if (method === 'DELETE') {
        exercises = exercises.filter((item) => !path.endsWith(`/${item.id}`));
        return { status: 204 };
      }
      const saved = { ...exercise, ...(body as object), id: 6 };
      exercises = [...exercises, saved];
      return { status: 201, body: { exercise: saved } };
    });
  }

  test('adding sends the problem to the picked chapter and lists it', async () => {
    const sent = server([]);
    render(<Exercises textbook={textbook} tree={[chapter]} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add problem' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Add problem' }));
    fill('Problem text', '외적을 구하라');
    fireEvent.submit(document.querySelector('form')!);
    // In the list: the form's own field holds the same text.
    expect(await screen.findByText('외적을 구하라', { selector: 'p' })).toBeInTheDocument();
    expect(sent[0]).toMatchObject({
      method: 'POST',
      path: url,
      body: { body: '외적을 구하라', number: '', important: false },
    });
    expect(await screen.findByText('Added')).toBeInTheDocument();
  });

  test('deleting asks first, then the problem leaves the list', async () => {
    const sent = server([exercise]);
    render(<Exercises textbook={textbook} tree={[chapter]} />);
    expect(await screen.findByText('내적을 구하라')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Problem 1 delete$/ }));
    expect(sent).toEqual([]);
    fireEvent.click(await screen.findByRole('button', { name: /^Problem 1 confirm deletion$/ }));
    await waitFor(() => expect(screen.queryByText('내적을 구하라')).toBeNull());
    expect(sent).toEqual([{ method: 'DELETE', path: '/api/exercises/5' }]);
  });
});
