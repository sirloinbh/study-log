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
});
const detailOf = (item: Schedule): ScheduleDetail => ({
  schedule: item,
  items: [
    { id: item.id * 10, date: '2026-03-02', targetMinutes: 120, contents: [] },
    { id: item.id * 10 + 1, date: '2026-03-07', targetMinutes: 90, contents: [] },
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
  expect(firstRow).toHaveTextContent('2026-03-02 ~ 2026-03-08 · 목표 20시간 · 7일');
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
