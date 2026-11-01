import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { Exercises } from './exercises';
import { StudyLogs } from './study-logs';
import { fakeApi } from './test/fake-api';
import { TextbookContents } from './textbook-contents';
import { Textbooks } from './textbooks';

// The whole page renders in each test and role queries are slow on the first run after a change.
vi.setConfig({ testTimeout: 20_000 });

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const serverError = { status: 500, body: { error: '서버 오류가 발생했습니다' } };

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
  const logList = () => document.querySelector<HTMLElement>('.log-list')!;

  // A small server holding the logs, so saving and deleting show up in the reloaded list.
  function server(start: (typeof log)[], failWrites = false) {
    let logs = start;
    return fakeApi(({ method, path, body }) => {
      if (path.startsWith('/api/textbooks')) return { body: { textbooks: [] } };
      if (method === 'GET') return { body: { studyLogs: logs } };
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
    await screen.findAllByRole('button', { name: /기록 삭제$/ });
    const item = within(logList());
    expect(item.getByText('09:00–10:30')).toBeInTheDocument();
    expect(item.getByText('1시간 30분')).toBeInTheDocument();
    expect(item.getByText('완료')).toBeInTheDocument();
  });

  test('adding sends the form, reloads the list and keeps the date for the next one', async () => {
    const sent = server([]);
    render(<StudyLogs today={today} />);
    expect(await screen.findByText('아직 학습 기록이 없습니다')).toBeInTheDocument();
    fill('학습일', '2026-10-20');
    fill('시작', '13:00');
    fill('종료', '14:00');
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText('저장했습니다')).toBeInTheDocument();
    expect(sent[0]).toMatchObject({
      method: 'POST',
      path: '/api/study-logs',
      body: { studyDate: '2026-10-20', startTime: '13:00', endTime: '14:00' },
    });
    await waitFor(() => expect(within(logList()).getByText('13:00–14:00')).toBeInTheDocument());
    expect(screen.getByLabelText<HTMLInputElement>('시작').value).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('학습일').value).toBe('2026-10-20');
  });

  test('deleting asks first, then the log leaves the list', async () => {
    const sent = server([log]);
    render(<StudyLogs today={today} />);
    fireEvent.click(await screen.findByRole('button', { name: /기록 삭제$/ }));
    expect(sent).toEqual([]);
    fireEvent.click(await screen.findByRole('button', { name: /기록 삭제 확인$/ }));
    expect(await screen.findByText('아직 학습 기록이 없습니다')).toBeInTheDocument();
    expect(sent).toEqual([{ method: 'DELETE', path: '/api/study-logs/1' }]);
  });

  test('a refused save shows the server message and keeps what was typed', async () => {
    server([], true);
    render(<StudyLogs today={today} />);
    await screen.findByText('아직 학습 기록이 없습니다');
    fill('시작', '13:00');
    fill('종료', '14:00');
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
    expect(screen.getByLabelText<HTMLInputElement>('시작').value).toBe('13:00');
  });

  test('a failed first load says so instead of claiming there are no logs', async () => {
    fakeApi(({ path }) =>
      path.startsWith('/api/textbooks') ? { body: { textbooks: [] } } : serverError,
    );
    render(<StudyLogs today={today} />);
    expect(
      await screen.findByText('최근 기록을 불러오지 못했습니다: 서버 오류가 발생했습니다'),
    ).toBeInTheDocument();
    expect(screen.queryByText('아직 학습 기록이 없습니다')).toBeNull();
  });
});

describe('textbooks', () => {
  const book = { id: 1, title: '선형대수', author: '길버트', edition: '5판' };

  function server(start: (typeof book)[]) {
    let books = start;
    return fakeApi(({ method, body }) => {
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
    const detail = within(screen.getByRole('region', { name: '교재 상세' }));
    expect(detail.getByText('길버트')).toBeInTheDocument();
    expect(detail.getByText('5판')).toBeInTheDocument();
  });

  test('adding sends the form, lists the textbook and clears the form', async () => {
    const sent = server([]);
    render(<Textbooks />);
    expect(await screen.findByText('아직 등록한 교재가 없습니다')).toBeInTheDocument();
    fill('제목', '해석학');
    fill('저자', '루딘');
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText('등록했습니다')).toBeInTheDocument();
    expect(sent[0]).toMatchObject({
      method: 'POST',
      path: '/api/textbooks',
      body: { title: '해석학', author: '루딘', edition: '' },
    });
    expect(await screen.findByRole('button', { name: '해석학' })).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>('제목').value).toBe('');
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
    fireEvent.click(await screen.findByRole('button', { name: /행렬 위로 이동$/ }));
    await waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0]).toEqual({
      method: 'PUT',
      path: '/api/textbooks/7/contents/order',
      body: { parentId: null, ids: [2, 1] },
    });
    // The answered order is shown, and the first entry cannot go further up.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /행렬 위로 이동$/ })).toBeDisabled(),
    );
  });

  test('a refused move shows the server message', async () => {
    const first = node(1, '1', '벡터');
    const second = node(2, '2', '행렬');
    fakeApi(({ method }) =>
      method === 'PUT' ? serverError : { body: { contents: [first, second] } },
    );
    render(<TextbookContents textbookId={7} />);
    fireEvent.click(await screen.findByRole('button', { name: /행렬 위로 이동$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
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
    await waitFor(() => expect(screen.getByRole('button', { name: '문제 추가' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '문제 추가' }));
    fill('문제 본문', '외적을 구하라');
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText('외적을 구하라')).toBeInTheDocument();
    expect(sent[0]).toMatchObject({
      method: 'POST',
      path: url,
      body: { body: '외적을 구하라', number: '', important: false },
    });
    expect(screen.getByText('추가했습니다')).toBeInTheDocument();
  });

  test('deleting asks first, then the problem leaves the list', async () => {
    const sent = server([exercise]);
    render(<Exercises textbook={textbook} tree={[chapter]} />);
    expect(await screen.findByText('내적을 구하라')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^문제 1 삭제$/ }));
    expect(sent).toEqual([]);
    fireEvent.click(await screen.findByRole('button', { name: /^문제 1 삭제 확인$/ }));
    await waitFor(() => expect(screen.queryByText('내적을 구하라')).toBeNull());
    expect(sent).toEqual([{ method: 'DELETE', path: '/api/exercises/5' }]);
  });
});
