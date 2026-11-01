import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

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
  totalMinutes: 1200,
  itemCount: 7,
});
const detailOf = (item: Schedule): ScheduleDetail => ({
  schedule: item,
  items: [
    { id: item.id * 10, date: '2026-03-02', targetMinutes: 120 },
    { id: item.id * 10 + 1, date: '2026-03-07', targetMinutes: 90 },
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
const list = () => within(screen.getByRole('region', { name: '내 일정' }));
const days = () => within(screen.getByRole('list', { name: '날짜별 목표 시간' }));

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
  expect(dayLabel('2026-03-02')).toBe('3월 2일 (월)');
  expect(dayLabel('2026-03-08')).toBe('3월 8일 (일)');
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
  expect(screen.getByRole('status')).toHaveTextContent('일정을 만들었습니다');
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

test('the newest schedule opens first, another opens when picked, and today is marked', async () => {
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
  fireEvent.click(list().getByRole('button', { name: '새 일정 삭제 취소' }));
  expect(sent).toEqual([]);

  fireEvent.click(list().getByRole('button', { name: '새 일정 삭제' }));
  fireEvent.click(list().getByRole('button', { name: '새 일정 삭제 확인' }));
  await screen.findByRole('heading', { level: 2, name: '지난 일정' });
  expect(sent).toEqual([{ method: 'DELETE', path: '/api/schedules/2' }]);
  expect(list().queryByRole('button', { name: '새 일정' })).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('일정을 삭제했습니다');
});

test('a failed delete says why and leaves the schedule', async () => {
  server([schedule(1, '지난 일정')], { status: 500, body: { error: '서버 오류가 발생했습니다' } });
  render(<Schedules today={today} />);
  await screen.findByRole('heading', { level: 2, name: '지난 일정' });
  fireEvent.click(list().getByRole('button', { name: '지난 일정 삭제' }));
  fireEvent.click(list().getByRole('button', { name: '지난 일정 삭제 확인' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다');
  expect(list().getByRole('button', { name: '지난 일정' })).toBeInTheDocument();
  await waitFor(() => expect(list().getByRole('button', { name: '지난 일정 삭제' })).toHaveFocus());
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
