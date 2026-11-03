import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import {
  dayLabel,
  dayNames,
  defaultEnd,
  hoursToMinutes,
  type Schedule,
  type ScheduleDetail,
} from './schedule';
import { Schedules } from './schedules';
import { fakeApi } from './test/fake-api';

// As in screens.test.tsx: the first run after a change is slow.
vi.setConfig({ testTimeout: 20_000 });
configure({ asyncUtilTimeout: 10_000 });

const today = '2026-03-02';

const schedule = (id: number, title: string): Schedule => ({
  id,
  title,
  startDate: '2026-03-02',
  endDate: '2026-03-08',
  weekdayMinutes: 120,
  restDayMinutes: 300,
  textbookId: null,
  textbookTitle: null,
  totalMinutes: 1200,
  itemCount: 7,
  currentEndDate: '2026-03-08',
  delayDays: 0,
  completedCount: 0,
  completedMinutes: 0,
  progressPercent: 0,
});
const detailOf = (item: Schedule): ScheduleDetail => ({
  schedule: item,
  items: [
    { id: item.id * 10, date: '2026-03-02', targetMinutes: 120, completedOn: null, contents: [] },
    {
      id: item.id * 10 + 1,
      date: '2026-03-07',
      targetMinutes: 90,
      completedOn: null,
      contents: [],
    },
  ],
});

// A small server holding the schedules, so making and deleting show up in the reloaded list.
function server(start: Schedule[], writeFailure?: { status: number; body: object }) {
  let rows = start;
  return fakeApi(({ method, path, body }) => {
    if (method === 'GET' && path === '/api/schedules') return { body: { schedules: rows } };
    if (method === 'GET') {
      const found = rows.find((item) => path.endsWith(`/${item.id}`));
      return found
        ? { body: detailOf(found) }
        : { status: 404, body: { error: '일정을 찾을 수 없습니다' } };
    }
    if (writeFailure) return writeFailure;
    if (method === 'DELETE') {
      rows = rows.filter((item) => !path.endsWith(`/${item.id}`));
      return { status: 204 };
    }
    const made = schedule(9, (body as { title: string }).title);
    rows = [made, ...rows];
    return { status: 201, body: detailOf(made) };
  });
}

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: '일정 만들기' }));
const form = () => within(screen.getByRole('region', { name: '일정 만들기' }));
const list = () => within(screen.getByRole('region', { name: '내 일정' }));
const days = () => within(screen.getByRole('list', { name: '날짜별 목표 시간' }));

describe('a textbook', () => {
  const book = { id: 7, title: '선형대수', author: '', edition: '' };
  const chapterNode = (id: number, number: string, title: string) => ({
    id,
    parentId: null,
    number,
    title,
    children: [],
  });
  const contents = [
    chapterNode(71, '1', '벡터'),
    chapterNode(72, '2', '행렬'),
    chapterNode(73, '3', '내적'),
  ];

  function bookServer(
    answerContents: { status?: number; body?: unknown } = { body: { contents } },
  ) {
    return fakeApi(({ method, path, body }) => {
      if (path === '/api/textbooks') return { body: { textbooks: [book] } };
      if (path === '/api/textbooks/7/contents') return answerContents;
      if (method === 'GET' && path === '/api/schedules') return { body: { schedules: [] } };
      const made = {
        ...schedule(9, (body as { title: string }).title),
        textbookId: 7,
        textbookTitle: '선형대수',
      };
      return {
        status: 201,
        body: {
          schedule: made,
          items: [
            {
              id: 90,
              date: '2026-03-02',
              targetMinutes: 120,
              completedOn: null,
              contents: [
                { id: 71, number: '1', title: '벡터' },
                { id: 72, number: '2', title: '행렬' },
              ],
            },
          ],
        },
      };
    });
  }

  const start = async () => {
    render(<Schedules today={today} />);
    await screen.findByText('아직 만든 일정이 없습니다');
    await screen.findByRole('option', { name: '선형대수' });
    fill('일정 이름', '선형대수 1회독');
  };

  test('without one nothing about chapters is sent, and the choices stay hidden', async () => {
    const sent = bookServer();
    await start();
    expect(screen.queryByLabelText('첫 장')).toBeNull();
    submit();
    await screen.findByRole('heading', { level: 2, name: '선형대수 1회독' });
    expect(sent[0].body as object).not.toHaveProperty('chapters');
  });

  test('its whole range is sent as no chapters picked, and the days name their chapters', async () => {
    const sent = bookServer();
    await start();
    fill('교재 (선택)', '7');
    await screen.findAllByRole('option', { name: '1 벡터' });
    submit();
    await screen.findByRole('heading', { level: 2, name: '선형대수 1회독' });
    expect((sent[0].body as { chapters: unknown }).chapters).toEqual({
      textbookId: 7,
      fromContentId: null,
      toContentId: null,
    });
    expect(days().getByText('1 벡터 · 2 행렬')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '날짜별 일정' })).toHaveTextContent('선형대수');
  });

  test('picked chapters are sent, and changing the book forgets them', async () => {
    const sent = bookServer();
    await start();
    fill('교재 (선택)', '7');
    await screen.findAllByRole('option', { name: '2 행렬' });
    fill('첫 장', '72');
    fill('마지막 장', '73');
    submit();
    await screen.findByRole('heading', { level: 2, name: '선형대수 1회독' });
    expect((sent[0].body as { chapters: unknown }).chapters).toEqual({
      textbookId: 7,
      fromContentId: 72,
      toContentId: 73,
    });
    fill('교재 (선택)', '');
    fill('교재 (선택)', '7');
    await screen.findAllByRole('option', { name: '2 행렬' });
    expect(screen.getByLabelText('첫 장')).toHaveValue('');
    expect(screen.getByLabelText('마지막 장')).toHaveValue('');
  });

  test('a book without chapters says what to do, and a failed read says so', async () => {
    bookServer({ body: { contents: [] } });
    await start();
    fill('교재 (선택)', '7');
    expect(await screen.findByText(/이 교재에는 장이 없습니다/)).toBeInTheDocument();
    cleanup();

    bookServer({ status: 500, body: { error: '서버 오류가 발생했습니다' } });
    await start();
    fill('교재 (선택)', '7');
    expect(await screen.findByText('이 교재의 목차를 불러오지 못했습니다')).toBeInTheDocument();
    cleanup();

    fakeApi(({ path }) =>
      path === '/api/schedules'
        ? { body: { schedules: [] } }
        : { status: 500, body: { error: '서버 오류가 발생했습니다' } },
    );
    render(<Schedules today={today} />);
    expect(await screen.findByText('교재 목록을 불러오지 못했습니다')).toBeInTheDocument();
  });

  test('without its chapters read, a book cannot make a schedule yet', async () => {
    const sent = bookServer({ status: 500, body: { error: '서버 오류가 발생했습니다' } });
    await start();
    fill('교재 (선택)', '7');
    await screen.findByText('이 교재의 목차를 불러오지 못했습니다');
    submit();
    expect(await form().findByRole('alert')).toHaveTextContent('목차를 아직 읽지 못했습니다');
    expect(sent).toEqual([]);
  });

  test('chapters read before do not count once the book is picked again', async () => {
    let failing = false;
    const sent = fakeApi(({ path }) => {
      if (path === '/api/textbooks') return { body: { textbooks: [book] } };
      if (path === '/api/schedules') return { body: { schedules: [] } };
      return failing
        ? { status: 500, body: { error: '서버 오류가 발생했습니다' } }
        : { body: { contents } };
    });
    await start();
    fill('교재 (선택)', '7');
    await screen.findAllByRole('option', { name: '1 벡터' });
    failing = true;
    fill('교재 (선택)', '');
    fill('교재 (선택)', '7');
    await screen.findByText('이 교재의 목차를 불러오지 못했습니다');
    expect(screen.queryByRole('option', { name: '1 벡터' })).toBeNull();
    submit();
    expect(await form().findByRole('alert')).toHaveTextContent('목차를 아직 읽지 못했습니다');
    expect(sent).toEqual([]);
  });

  test('while the chapters are being read a schedule waits, and another book is not offered', async () => {
    const answers: (() => void)[] = [];
    const reply = (body: unknown) => new Response(JSON.stringify(body));
    const fetchMock = vi.fn((path: string) => {
      if (path === '/api/textbooks')
        return Promise.resolve(reply({ textbooks: [book, { ...book, id: 8, title: '해석학' }] }));
      if (path === '/api/schedules') return Promise.resolve(reply({ schedules: [] }));
      if (path === '/api/textbooks/7/contents') return Promise.resolve(reply({ contents }));
      return new Promise<Response>((resolve) =>
        answers.push(() => resolve(reply({ contents: [chapterNode(81, '1', '극한')] }))),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    await start();
    fill('교재 (선택)', '7');
    await screen.findAllByRole('option', { name: '1 벡터' });
    fill('교재 (선택)', '8');
    await waitFor(() => expect(answers).toHaveLength(1));
    // Book 7's chapters are not shown for book 8 while its own are on their way.
    expect(screen.queryByRole('option', { name: '1 벡터' })).toBeNull();
    submit();
    expect(await form().findByRole('alert')).toHaveTextContent('목차를 아직 읽지 못했습니다');
    expect(
      fetchMock.mock.calls.some(
        ([, init]: unknown[]) => (init as { method?: string })?.method === 'POST',
      ),
    ).toBe(false);
    answers.forEach((answer) => answer());
    await screen.findAllByRole('option', { name: '1 극한' });
  });

  test('a late answer for the book left behind is not offered for this one', async () => {
    const late: (() => void)[] = [];
    const reply = (body: unknown) => new Response(JSON.stringify(body));
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => {
        if (path === '/api/textbooks')
          return Promise.resolve(reply({ textbooks: [book, { ...book, id: 8, title: '해석학' }] }));
        if (path === '/api/schedules') return Promise.resolve(reply({ schedules: [] }));
        if (path === '/api/textbooks/7/contents')
          return new Promise<Response>((resolve) => late.push(() => resolve(reply({ contents }))));
        return Promise.resolve(reply({ contents: [chapterNode(81, '1', '극한')] }));
      }),
    );
    await start();
    fill('교재 (선택)', '7');
    fill('교재 (선택)', '8');
    await screen.findAllByRole('option', { name: '1 극한' });
    late.forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('option', { name: '1 벡터' })).toBeNull();
    expect(screen.getAllByRole('option', { name: '1 극한' })).toHaveLength(2);
  });

  test('a schedule with a book names it in the list', async () => {
    fakeApi(({ path }) =>
      path === '/api/schedules'
        ? {
            body: {
              schedules: [
                { ...schedule(1, '지난 일정'), textbookId: 7, textbookTitle: '선형대수' },
              ],
            },
          }
        : path === '/api/textbooks'
          ? { body: { textbooks: [book] } }
          : { body: detailOf(schedule(1, '지난 일정')) },
    );
    render(<Schedules today={today} />);
    await screen.findByRole('heading', { level: 2, name: '지난 일정' });
    expect(list().getByRole('button', { name: '지난 일정' }).closest('li')).toHaveTextContent(
      '선형대수 · 2026-03-02 ~ 2026-03-08',
    );
  });
});

describe('adjusting the days', () => {
  const adjustable = () => {
    const made = schedule(1, '지난 일정');
    let current = detailOf(made);
    const sent = fakeApi(({ method, path, body }) => {
      if (path === '/api/textbooks') return { body: { textbooks: [] } };
      if (path === '/api/schedules') return { body: { schedules: [current.schedule] } };
      if (method === 'GET') return { body: current };
      const id = Number(path.split('/')[5]);
      current = {
        ...current,
        items: current.items.map((item) => {
          if (item.id !== id) return item;
          if (path.endsWith('/complete')) return { ...item, completedOn: today };
          if (path.endsWith('/reopen')) return { ...item, completedOn: null };
          return { ...item, date: (body as { date: string }).date };
        }),
      };
      return { body: current };
    });
    return sent;
  };
  const opened = async () => {
    render(<Schedules today={today} />);
    await screen.findByRole('heading', { level: 2, name: '지난 일정' });
  };
  const dayCard = () => within(screen.getByRole('region', { name: '날짜별 일정' }));

  test('a day is completed and reopened, and focus stays on it', async () => {
    const sent = adjustable();
    await opened();
    const check = days().getByRole('checkbox', { name: '3월 2일 (월) 완료' });
    expect(check).not.toBeChecked();
    fireEvent.click(check);
    await dayCard().findByText('완료로 표시했습니다');
    expect(sent).toEqual([{ method: 'POST', path: '/api/schedules/1/items/10/complete' }]);
    expect(days().getByRole('checkbox', { name: '3월 2일 (월) 완료' })).toBeChecked();
    expect(days().getByText('3월 2일 (월)').closest('li')).toHaveClass('done');
    await waitFor(() =>
      expect(days().getByRole('checkbox', { name: '3월 2일 (월) 완료' })).toHaveFocus(),
    );
    // A completed day cannot be moved.
    expect(days().queryByRole('button', { name: '3월 2일 (월) 옮기기' })).toBeNull();

    fireEvent.click(days().getByRole('checkbox', { name: '3월 2일 (월) 완료' }));
    await dayCard().findByText('완료를 취소했습니다');
    expect(sent[1]).toEqual({ method: 'POST', path: '/api/schedules/1/items/10/reopen' });
    expect(days().getByRole('button', { name: '3월 2일 (월) 옮기기' })).toBeInTheDocument();
  });

  test('a day moves alone unless asked, and can be cancelled', async () => {
    const sent = adjustable();
    await opened();
    fireEvent.click(days().getByRole('button', { name: '3월 7일 (토) 옮기기' }));
    expect(days().getByLabelText('옮길 날짜')).toHaveValue('2026-03-07');
    await waitFor(() => expect(days().getByLabelText('옮길 날짜')).toHaveFocus());
    fireEvent.click(days().getByRole('button', { name: '취소' }));
    expect(days().queryByLabelText('옮길 날짜')).toBeNull();
    await waitFor(() =>
      expect(days().getByRole('button', { name: '3월 7일 (토) 옮기기' })).toHaveFocus(),
    );
    expect(sent).toEqual([]);

    fireEvent.click(days().getByRole('button', { name: '3월 7일 (토) 옮기기' }));
    fireEvent.change(days().getByLabelText('옮길 날짜'), { target: { value: '2026-03-10' } });
    fireEvent.submit(days().getByLabelText('옮길 날짜').closest('form')!);
    await dayCard().findByText('날짜를 옮겼습니다');
    await waitFor(() =>
      expect(days().getByRole('button', { name: '3월 10일 (화) 옮기기' })).toHaveFocus(),
    );
    expect(sent).toEqual([
      {
        method: 'PUT',
        path: '/api/schedules/1/items/11/date',
        body: { date: '2026-03-10', withLater: false },
      },
    ]);
    expect(days().getByText('3월 10일 (화)')).toBeInTheDocument();
    expect(days().queryByLabelText('옮길 날짜')).toBeNull();
  });

  test('later days are taken along when asked', async () => {
    const sent = adjustable();
    await opened();
    fireEvent.click(days().getByRole('button', { name: '3월 2일 (월) 옮기기' }));
    fireEvent.change(days().getByLabelText('옮길 날짜'), { target: { value: '2026-03-04' } });
    fireEvent.click(days().getByLabelText('이후 일정도 함께'));
    fireEvent.submit(days().getByLabelText('옮길 날짜').closest('form')!);
    await dayCard().findByText('이후 일정과 함께 옮겼습니다');
    expect(sent[0].body).toEqual({ date: '2026-03-04', withLater: true });
  });

  test('a refusal is said beside the days and keeps the move open', async () => {
    fakeApi(({ method, path }) => {
      if (path === '/api/textbooks') return { body: { textbooks: [] } };
      if (path === '/api/schedules') return { body: { schedules: [schedule(1, '지난 일정')] } };
      if (method === 'GET') return { body: detailOf(schedule(1, '지난 일정')) };
      return { status: 400, body: { error: '날짜는 오늘 이후여야 합니다' } };
    });
    await opened();
    fireEvent.click(days().getByRole('button', { name: '3월 2일 (월) 옮기기' }));
    fireEvent.submit(days().getByLabelText('옮길 날짜').closest('form')!);
    expect(await dayCard().findByRole('alert')).toHaveTextContent('날짜는 오늘 이후여야 합니다');
    expect(days().getByLabelText('옮길 날짜')).toBeInTheDocument();
    // Back where it can be corrected, and correcting it takes the complaint back.
    await waitFor(() => expect(days().getByLabelText('옮길 날짜')).toHaveFocus());
    fireEvent.change(days().getByLabelText('옮길 날짜'), { target: { value: '2026-03-20' } });
    expect(dayCard().queryByRole('alert')).toBeNull();
  });

  test('what was said about a day does not stay for another schedule', async () => {
    const first = detailOf(schedule(2, '새 일정'));
    let rows = [schedule(2, '새 일정'), schedule(1, '지난 일정')];
    fakeApi(({ method, path }) => {
      if (path === '/api/textbooks') return { body: { textbooks: [] } };
      if (path === '/api/schedules') return { body: { schedules: rows } };
      if (method === 'DELETE') {
        rows = rows.filter((row) => row.id !== 2);
        return { status: 204 };
      }
      if (method === 'GET')
        return { body: detailOf(path.endsWith('/2') ? rows[0] : schedule(1, '지난 일정')) };
      return { body: first };
    });
    render(<Schedules today={today} />);
    await screen.findByRole('heading', { level: 2, name: '새 일정' });
    fireEvent.click(days().getByRole('checkbox', { name: '3월 2일 (월) 완료' }));
    await dayCard().findByText('완료로 표시했습니다');
    fireEvent.click(list().getByRole('button', { name: '새 일정 삭제' }));
    fireEvent.click(list().getByRole('button', { name: '새 일정 삭제 확인' }));
    await screen.findByRole('heading', { level: 2, name: '지난 일정' });
    expect(dayCard().queryByText('완료로 표시했습니다')).toBeNull();
  });

  test('a schedule gone elsewhere says so beside the list, and focus goes there', async () => {
    let rows = [schedule(2, '새 일정'), schedule(1, '지난 일정')];
    fakeApi(({ method, path }) => {
      if (path === '/api/textbooks') return { body: { textbooks: [] } };
      if (path === '/api/schedules') return { body: { schedules: rows } };
      if (method === 'GET')
        return {
          body: detailOf(path.endsWith('/2') ? schedule(2, '새 일정') : schedule(1, '지난 일정')),
        };
      rows = rows.filter((row) => row.id !== 2);
      return { status: 404, body: { error: '일정을 찾을 수 없습니다' } };
    });
    render(<Schedules today={today} />);
    await screen.findByRole('heading', { level: 2, name: '새 일정' });
    fireEvent.click(days().getByRole('checkbox', { name: '3월 2일 (월) 완료' }));
    expect(await list().findByRole('alert')).toHaveTextContent('일정을 찾을 수 없습니다');
    // The next one opens, with nothing said about the one that is gone.
    await screen.findByRole('heading', { level: 2, name: '지난 일정' });
    expect(dayCard().queryByRole('alert')).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { name: '내 일정' })).toHaveFocus());
  });

  test('a day done elsewhere closes its move, and focus goes to its box', async () => {
    let current = detailOf(schedule(1, '지난 일정'));
    fakeApi(({ method, path }) => {
      if (path === '/api/textbooks') return { body: { textbooks: [] } };
      if (path === '/api/schedules') return { body: { schedules: [current.schedule] } };
      if (method === 'GET') return { body: current };
      current = {
        ...current,
        items: current.items.map((item) => ({ ...item, completedOn: today })),
      };
      return { status: 409, body: { error: '완료한 항목은 옮길 수 없습니다' } };
    });
    await opened();
    fireEvent.click(days().getByRole('button', { name: '3월 2일 (월) 옮기기' }));
    fireEvent.submit(days().getByLabelText('옮길 날짜').closest('form')!);
    expect(await dayCard().findByRole('alert')).toHaveTextContent('완료한 항목은 옮길 수 없습니다');
    expect(days().queryByLabelText('옮길 날짜')).toBeNull();
    await waitFor(() =>
      expect(days().getByRole('checkbox', { name: '3월 2일 (월) 완료' })).toHaveFocus(),
    );
  });

  test('days on the same date are told apart', () => {
    expect([
      ...dayNames(
        [
          { id: 1, date: '2026-03-02' },
          { id: 2, date: '2026-03-02' },
          { id: 3, date: '2026-03-03' },
        ],
        '2026-03-02',
      ).values(),
    ]).toEqual(['3월 2일 (월) 1번째', '3월 2일 (월) 2번째', '3월 3일 (화)']);
  });

  test('progress is shown as a bar with the time and days done', async () => {
    const going = {
      ...schedule(1, '지난 일정'),
      completedCount: 2,
      completedMinutes: 300,
      progressPercent: 25,
    };
    fakeApi(({ path }) => {
      if (path === '/api/textbooks') return { body: { textbooks: [] } };
      if (path === '/api/schedules') return { body: { schedules: [going] } };
      return { body: detailOf(going) };
    });
    await opened();
    const bar = dayCard().getByRole('progressbar', { name: '일정 진행률' });
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(bar.firstElementChild).toHaveStyle({ width: '25%' });
    expect(dayCard().getByText('25%')).toBeInTheDocument();
    expect(dayCard().getByText(/5시간 \/ 20시간 · 2 \/ 7일/)).toBeInTheDocument();
    expect(list().getByRole('button', { name: '지난 일정' }).closest('li')).toHaveTextContent(
      '진행 25%',
    );
  });

  test('completing a day raises the progress shown', async () => {
    const before = schedule(1, '지난 일정');
    const after = { ...before, completedCount: 1, completedMinutes: 120, progressPercent: 10 };
    let current = before;
    fakeApi(({ method, path }) => {
      if (path === '/api/textbooks') return { body: { textbooks: [] } };
      if (path === '/api/schedules') return { body: { schedules: [current] } };
      if (method === 'GET') return { body: detailOf(current) };
      current = after;
      return { body: detailOf(after) };
    });
    await opened();
    fireEvent.click(days().getByRole('checkbox', { name: '3월 2일 (월) 완료' }));
    await waitFor(() =>
      expect(dayCard().getByRole('progressbar', { name: '일정 진행률' })).toHaveAttribute(
        'aria-valuenow',
        '10',
      ),
    );
    // The list follows.
    await waitFor(() =>
      expect(list().getByRole('button', { name: '지난 일정' }).closest('li')).toHaveTextContent(
        '진행 10%',
      ),
    );
  });

  test('a delay is shown with the end first chosen', async () => {
    const late = {
      ...schedule(1, '지난 일정'),
      currentEndDate: '2026-03-10',
      delayDays: 2,
    };
    fakeApi(({ path }) => {
      if (path === '/api/textbooks') return { body: { textbooks: [] } };
      if (path === '/api/schedules') return { body: { schedules: [late] } };
      return { body: detailOf(late) };
    });
    await opened();
    expect(
      dayCard().getByText(/처음 정한 종료일 2026-03-08에서\s*2일 늦어져 2026-03-10에\s*끝납니다/),
    ).toBeInTheDocument();
    expect(list().getByRole('button', { name: '지난 일정' }).closest('li')).toHaveTextContent(
      '2026-03-08 (2일 늦어짐)',
    );
  });
});

test('hours as typed become minutes, and only 0 to 24 count', () => {
  expect(hoursToMinutes('2')).toBe(120);
  expect(hoursToMinutes('1.5')).toBe(90);
  expect(hoursToMinutes('0')).toBe(0);
  expect(hoursToMinutes('24')).toBe(1440);
  expect(hoursToMinutes('')).toBeUndefined();
  expect(hoursToMinutes(' ')).toBeUndefined();
  expect(hoursToMinutes('-1')).toBeUndefined();
  expect(hoursToMinutes('24.5')).toBeUndefined();
  expect(hoursToMinutes('두 시간')).toBeUndefined();
});

test('the end proposed is thirty days on, and a day reads with its weekday', () => {
  expect(defaultEnd('2026-03-02')).toBe('2026-03-31');
  expect(defaultEnd('2026-12-15')).toBe('2027-01-13');
  expect(dayLabel('2026-03-02', '2026-03-02')).toBe('3월 2일 (월)');
  expect(dayLabel('2026-03-08', '2026-03-02')).toBe('3월 8일 (일)');
  // In the year after the start.
  expect(dayLabel('2027-01-01', '2026-12-30')).toBe('2027년 1월 1일 (금)');
});

test('the form starts with the suggested dates and hours', async () => {
  server([]);
  render(<Schedules today={today} />);
  await screen.findByText('아직 만든 일정이 없습니다');
  expect(screen.getByLabelText('시작일')).toHaveValue(today);
  expect(screen.getByLabelText('종료일')).toHaveValue('2026-03-31');
  expect(screen.getByLabelText('평일 (시간)')).toHaveValue(2);
  expect(screen.getByLabelText('주말·공휴일 (시간)')).toHaveValue(5);
  expect(screen.queryByRole('region', { name: '날짜별 일정' })).toBeNull();
});

test('making a schedule sends minutes and shows its days', async () => {
  const sent = server([]);
  render(<Schedules today={today} />);
  await screen.findByText('아직 만든 일정이 없습니다');
  fill('일정 이름', '알고리즘');
  fill('종료일', '2026-03-08');
  fill('평일 (시간)', '1.5');
  fill('주말·공휴일 (시간)', '0');
  submit();
  await screen.findByRole('heading', { level: 2, name: '알고리즘' });
  expect(sent).toEqual([
    {
      method: 'POST',
      path: '/api/schedules',
      body: {
        title: '알고리즘',
        startDate: today,
        endDate: '2026-03-08',
        weekdayMinutes: 90,
        restDayMinutes: 0,
      },
    },
  ]);
  expect(form().getByRole('status')).toHaveTextContent('일정을 만들었습니다');
  expect(screen.getByLabelText('일정 이름')).toHaveValue('');
  // The period and hours stay, to make another one like it.
  expect(screen.getByLabelText('종료일')).toHaveValue('2026-03-08');
  expect(days().getByText('3월 7일 (토)')).toBeInTheDocument();
  expect(days().getByText('1시간 30분')).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 2, name: '알고리즘' })).toHaveFocus(),
  );
  expect(list().getByRole('button', { name: '알고리즘' })).toHaveAttribute('aria-current', 'true');
});

test('hours out of range stop before the server', async () => {
  const sent = server([]);
  render(<Schedules today={today} />);
  await screen.findByText('아직 만든 일정이 없습니다');
  fill('일정 이름', '알고리즘');
  fill('평일 (시간)', '25');
  // Past the browser's own check of the field, which stops a click.
  fireEvent.submit(document.querySelector('.schedules form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('0시간에서 24시간');
  expect(sent).toEqual([]);
});

test('a refusal shows the server message and keeps what was typed', async () => {
  const message = '공휴일 API 키(HOLIDAY_API_KEY)가 서버에 설정되지 않았습니다';
  server([], { status: 503, body: { error: message } });
  render(<Schedules today={today} />);
  await screen.findByText('아직 만든 일정이 없습니다');
  fill('일정 이름', '알고리즘');
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.getByLabelText('일정 이름')).toHaveValue('알고리즘');
  expect(screen.getByRole('button', { name: '일정 만들기' })).toBeEnabled();
});

test('the first in the list opens, another opens when picked, and today is marked', async () => {
  server([schedule(2, '새 일정'), schedule(1, '지난 일정')]);
  render(<Schedules today={today} />);
  await screen.findByRole('heading', { level: 2, name: '새 일정' });
  const firstRow = list().getByRole('button', { name: '새 일정' }).closest('li')!;
  expect(firstRow).toHaveTextContent('2026-03-02 ~ 2026-03-08 · 진행 0% · 목표 20시간 · 7일');
  const row = days().getByText('3월 2일 (월)').closest('li');
  expect(row).toHaveAttribute('aria-current', 'date');
  expect(days().getByText('3월 7일 (토)').closest('li')).not.toHaveAttribute('aria-current');

  fireEvent.click(list().getByRole('button', { name: '지난 일정' }));
  await screen.findByRole('heading', { level: 2, name: '지난 일정' });
  expect(screen.queryByRole('heading', { level: 2, name: '새 일정' })).toBeNull();
});

test('deleting asks first, and the next schedule opens', async () => {
  const sent = server([schedule(2, '새 일정'), schedule(1, '지난 일정')]);
  render(<Schedules today={today} />);
  await screen.findByRole('heading', { level: 2, name: '새 일정' });

  fireEvent.click(list().getByRole('button', { name: '새 일정 삭제' }));
  await waitFor(() =>
    expect(list().getByRole('button', { name: '새 일정 삭제 확인' })).toHaveFocus(),
  );
  fireEvent.click(list().getByRole('button', { name: '새 일정 삭제 취소' }));
  await waitFor(() => expect(list().getByRole('button', { name: '새 일정 삭제' })).toHaveFocus());
  expect(sent).toEqual([]);

  fireEvent.click(list().getByRole('button', { name: '새 일정 삭제' }));
  fireEvent.click(list().getByRole('button', { name: '새 일정 삭제 확인' }));
  await screen.findByRole('heading', { level: 2, name: '지난 일정' });
  expect(sent).toEqual([{ method: 'DELETE', path: '/api/schedules/2' }]);
  expect(list().queryByRole('button', { name: '새 일정' })).toBeNull();
  // Beside the list, which can be scrolled far below the form.
  expect(list().getByRole('status')).toHaveTextContent('일정을 삭제했습니다');
  await waitFor(() => expect(screen.getByRole('heading', { name: '내 일정' })).toHaveFocus());
});

test('a failed delete says why and leaves the schedule', async () => {
  server([schedule(1, '지난 일정')], { status: 500, body: { error: '서버 오류가 발생했습니다' } });
  render(<Schedules today={today} />);
  await screen.findByRole('heading', { level: 2, name: '지난 일정' });
  fireEvent.click(list().getByRole('button', { name: '지난 일정 삭제' }));
  fireEvent.click(list().getByRole('button', { name: '지난 일정 삭제 확인' }));
  expect(await list().findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(list().getByRole('button', { name: '지난 일정' })).toBeInTheDocument();
  await waitFor(() => expect(list().getByRole('button', { name: '지난 일정 삭제' })).toHaveFocus());
});

test('a schedule deleted elsewhere says so and focus goes to the list heading', async () => {
  server([schedule(1, '지난 일정')], { status: 404, body: { error: '일정을 찾을 수 없습니다' } });
  render(<Schedules today={today} />);
  await screen.findByRole('heading', { level: 2, name: '지난 일정' });
  fireEvent.click(list().getByRole('button', { name: '지난 일정 삭제' }));
  fireEvent.click(list().getByRole('button', { name: '지난 일정 삭제 확인' }));
  expect(await list().findByRole('alert')).toHaveTextContent('일정을 찾을 수 없습니다');
  await waitFor(() => expect(screen.getByRole('heading', { name: '내 일정' })).toHaveFocus());
});

test('a deleted schedule leaves at once, even when the list cannot be read again', async () => {
  let deleted = false;
  fakeApi(({ method, path }) => {
    if (method === 'DELETE') {
      deleted = true;
      return { status: 204 };
    }
    if (deleted) return { status: 500, body: { error: '서버 오류가 발생했습니다' } };
    return path === '/api/schedules'
      ? { body: { schedules: [schedule(2, '새 일정'), schedule(1, '지난 일정')] } }
      : { body: detailOf(schedule(path.endsWith('/2') ? 2 : 1, '새 일정')) };
  });
  render(<Schedules today={today} />);
  await screen.findByRole('heading', { level: 2, name: '새 일정' });
  fireEvent.click(list().getByRole('button', { name: '새 일정 삭제' }));
  fireEvent.click(list().getByRole('button', { name: '새 일정 삭제 확인' }));
  await list().findByText('일정을 삭제했습니다');
  expect(list().queryByRole('button', { name: '새 일정' })).toBeNull();
  expect(list().getByRole('button', { name: '지난 일정' })).toBeInTheDocument();
});

test('days that could not be read are tried again by picking the schedule', async () => {
  let failing = true;
  fakeApi(({ path }) => {
    if (path === '/api/schedules') return { body: { schedules: [schedule(1, '지난 일정')] } };
    return failing
      ? { status: 500, body: { error: '서버 오류가 발생했습니다' } }
      : { body: detailOf(schedule(1, '지난 일정')) };
  });
  render(<Schedules today={today} />);
  await screen.findByText(/날짜별 일정을 불러오지 못했습니다/);
  // A second failure is said anew: the message leaves while trying.
  const first = screen.getByText(/날짜별 일정을 불러오지 못했습니다/);
  fireEvent.click(list().getByRole('button', { name: '지난 일정' }));
  expect(first).not.toBeInTheDocument();
  await screen.findByText(/날짜별 일정을 불러오지 못했습니다/);
  failing = false;
  fireEvent.click(list().getByRole('button', { name: '지난 일정' }));
  await screen.findByRole('heading', { level: 2, name: '지난 일정' });
  expect(screen.queryByText(/날짜별 일정을 불러오지 못했습니다/)).toBeNull();
});

test('days already read stay when reading them again fails, and focus stays', async () => {
  let made = false;
  fakeApi(({ method, path, body }) => {
    if (method === 'POST') {
      made = true;
      return { status: 201, body: detailOf(schedule(9, (body as { title: string }).title)) };
    }
    if (path === '/api/schedules')
      return { body: { schedules: made ? [schedule(9, '알고리즘')] : [] } };
    return { status: 500, body: { error: '서버 오류가 발생했습니다' } };
  });
  render(<Schedules today={today} />);
  await screen.findByText('아직 만든 일정이 없습니다');
  fill('일정 이름', '알고리즘');
  submit();
  const heading = await screen.findByRole('heading', { level: 2, name: '알고리즘' });
  await waitFor(() => expect(heading).toHaveFocus());
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(heading).toHaveFocus();
  expect(screen.queryByText(/날짜별 일정을 불러오지 못했습니다/)).toBeNull();
  expect(days().getByText('3월 2일 (월)')).toBeInTheDocument();
});

test('typing takes back the last complaint, and a new schedule ends a pending delete', async () => {
  server([schedule(1, '지난 일정')]);
  render(<Schedules today={today} />);
  await screen.findByRole('heading', { level: 2, name: '지난 일정' });
  fill('일정 이름', '알고리즘');
  fill('평일 (시간)', '25');
  fireEvent.submit(document.querySelector('.schedules form')!);
  await form().findByRole('alert');
  fill('평일 (시간)', '2');
  expect(form().queryByRole('alert')).toBeNull();

  fireEvent.click(list().getByRole('button', { name: '지난 일정 삭제' }));
  submit();
  await screen.findByRole('heading', { level: 2, name: '알고리즘' });
  expect(list().queryByRole('button', { name: '지난 일정 삭제 확인' })).toBeNull();
});

test('two submits at once make one schedule', async () => {
  const sent = server([]);
  render(<Schedules today={today} />);
  await screen.findByText('아직 만든 일정이 없습니다');
  fill('일정 이름', '알고리즘');
  const element = document.querySelector('.schedules form')!;
  fireEvent.submit(element);
  fireEvent.submit(element);
  await screen.findByRole('heading', { level: 2, name: '알고리즘' });
  expect(sent).toHaveLength(1);
});

test('a list or days that cannot be read say so', async () => {
  fakeApi(() => ({ status: 500, body: { error: '서버 오류가 발생했습니다' } }));
  const { unmount } = render(<Schedules today={today} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('일정을 불러오지 못했습니다');
  unmount();

  fakeApi(({ path }) =>
    path === '/api/schedules'
      ? { body: { schedules: [schedule(1, '지난 일정')] } }
      : { status: 500, body: { error: '서버 오류가 발생했습니다' } },
  );
  render(<Schedules today={today} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('날짜별 일정을 불러오지 못했습니다');
});

test('a slow answer for the schedule left behind is not shown', async () => {
  const late: ((value: Response) => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) => {
      const reply = (body: unknown) => new Response(JSON.stringify(body));
      if (path === '/api/schedules')
        return Promise.resolve(
          reply({ schedules: [schedule(2, '새 일정'), schedule(1, '지난 일정')] }),
        );
      if (path.endsWith('/2'))
        return new Promise<Response>((resolve) =>
          late.push(() => resolve(reply(detailOf(schedule(2, '새 일정'))))),
        );
      return Promise.resolve(reply(detailOf(schedule(1, '지난 일정'))));
    }),
  );
  render(<Schedules today={today} />);
  fireEvent.click(
    await within(await screen.findByRole('region', { name: '내 일정' })).findByRole('button', {
      name: '지난 일정',
    }),
  );
  await screen.findByRole('heading', { level: 2, name: '지난 일정' });
  late.forEach((resolve) => resolve(new Response()));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(screen.getByRole('heading', { level: 2, name: '지난 일정' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 2, name: '새 일정' })).toBeNull();
});

describe('renaming a schedule (#179)', () => {
  // The name the server holds, and the answer to a rename when it is not a success.
  const renamable = (refusal?: { status: number; body: object }) => {
    let current = schedule(1, '지난 일정');
    return fakeApi(({ method, path, body }) => {
      if (path === '/api/textbooks') return { body: { textbooks: [] } };
      if (path === '/api/schedules') return { body: { schedules: [current] } };
      if (method === 'GET') return { body: detailOf(current) };
      if (refusal) return refusal;
      current = { ...current, title: (body as { title: string }).title.trim() };
      return { body: detailOf(current) };
    });
  };
  const opened = async () => {
    render(<Schedules today={today} />);
    await screen.findByRole('heading', { level: 2, name: '지난 일정' });
  };
  const dayCard = () => within(screen.getByRole('region', { name: '날짜별 일정' }));
  const startRenaming = async () => {
    fireEvent.click(dayCard().getByRole('button', { name: '지난 일정 이름 수정' }));
    const input = dayCard().getByLabelText('일정 이름');
    await waitFor(() => expect(input).toHaveFocus());
    return input;
  };
  const save = () => fireEvent.click(dayCard().getByRole('button', { name: '이름 저장' }));

  test('a new name is saved and shown in the heading and the list', async () => {
    const sent = renamable();
    await opened();
    const input = await startRenaming();
    expect(input).toHaveValue('지난 일정');
    fireEvent.change(input, { target: { value: '  선형대수 복습  ' } });
    save();
    await dayCard().findByText('일정 이름을 바꿨습니다');
    expect(sent).toEqual([
      { method: 'PUT', path: '/api/schedules/1', body: { title: '  선형대수 복습  ' } },
    ]);
    const heading = screen.getByRole('heading', { level: 2, name: '선형대수 복습' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(list().getByRole('button', { name: '선형대수 복습' })).toBeInTheDocument();
    expect(dayCard().queryByLabelText('일정 이름')).toBeNull();
  });

  test('cancelling sends nothing and goes back to the button', async () => {
    const sent = renamable();
    await opened();
    const input = await startRenaming();
    fireEvent.change(input, { target: { value: '다른 이름' } });
    fireEvent.click(dayCard().getByRole('button', { name: '취소' }));
    expect(dayCard().queryByLabelText('일정 이름')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: '지난 일정' })).toBeInTheDocument();
    await waitFor(() =>
      expect(dayCard().getByRole('button', { name: '지난 일정 이름 수정' })).toHaveFocus(),
    );
    expect(sent).toEqual([]);
  });

  test('a blank name is refused before asking the server', async () => {
    const sent = renamable();
    await opened();
    const input = await startRenaming();
    fireEvent.change(input, { target: { value: '   ' } });
    save();
    expect(await dayCard().findByRole('alert')).toHaveTextContent('일정 이름을 입력하세요');
    expect(sent).toEqual([]);
    // Typing again takes the message back.
    fireEvent.change(input, { target: { value: '새 이름' } });
    expect(dayCard().queryByRole('alert')).toBeNull();
  });

  test('a refusal is said beside the name, which stays open to fix', async () => {
    renamable({ status: 400, body: { error: '일정 이름 길이는 200자 이하여야 합니다' } });
    await opened();
    const input = await startRenaming();
    fireEvent.change(input, { target: { value: '새 이름' } });
    save();
    expect(await dayCard().findByRole('alert')).toHaveTextContent(
      '일정 이름 길이는 200자 이하여야 합니다',
    );
    await waitFor(() => expect(dayCard().getByLabelText('일정 이름')).toHaveFocus());
    expect(dayCard().getByLabelText('일정 이름')).toHaveValue('새 이름');
  });

  test('a schedule deleted elsewhere is said in the list', async () => {
    renamable({ status: 404, body: { error: '일정을 찾을 수 없습니다' } });
    await opened();
    const input = await startRenaming();
    fireEvent.change(input, { target: { value: '새 이름' } });
    save();
    expect(await list().findByRole('alert')).toHaveTextContent('일정을 찾을 수 없습니다');
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: '내 일정' })).toHaveFocus(),
    );
    expect(screen.queryByLabelText('일정 이름', { selector: '#schedule-rename-input' })).toBeNull();
  });
});
