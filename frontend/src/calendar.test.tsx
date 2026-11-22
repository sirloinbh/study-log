import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';

import { Calendar } from './calendar';
import { calendarCells, monthTitle, shiftMonth, shortMinutes } from './month-calendar';
import { StudyLogs } from './study-logs';
import { type Api, fakeApi } from './test/fake-api';

const today = '2026-10-22';

type Log = {
  id: number;
  studyDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  memo: string;
  status: string;
};

const log = (id: number, studyDate: string, minutes: number, status = 'done'): Log => ({
  id,
  studyDate,
  startTime: '09:00',
  endTime: '10:00',
  durationMinutes: minutes,
  memo: `Memo ${id}`,
  status,
});

// The study log API with the calendar.
function server(
  initial: Log[],
  options: { failCalendar?: boolean; failMonths?: string[]; failDays?: string[] } = {},
) {
  const logs = [...initial];
  const failed = { status: 500, body: { error: 'Server error' } };
  return fakeApi(({ method, path, body }) => {
    if (path === '/api/textbooks') return { body: { textbooks: [] } };
    const month = path.match(/^\/api\/study-logs\/calendar\?month=(\d{4}-\d{2})$/);
    if (month) {
      if (options.failCalendar || options.failMonths?.includes(month[1])) return failed;
      const [year, number] = month[1].split('-').map(Number);
      const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
      const days = Array.from({ length: last }, (_, i) => {
        const date = `${month[1]}-${String(i + 1).padStart(2, '0')}`;
        const ofDay = logs.filter((l) => l.studyDate === date);
        return {
          date,
          minutes: ofDay
            .filter((l) => l.status !== 'planned')
            .reduce((sum, l) => sum + l.durationMinutes, 0),
          logs: ofDay.length,
        };
      });
      return { body: { month: month[1], days } };
    }
    const day = path.match(/^\/api\/study-logs\?date=(.+)$/);
    if (day) {
      if (options.failDays?.includes(day[1])) return failed;
      return { body: { studyLogs: logs.filter((l) => l.studyDate === day[1]) } };
    }
    if (path.startsWith('/api/study-logs?limit=')) return { body: { studyLogs: logs } };
    if (path === '/api/study-logs' && method === 'POST') {
      const saved = log(100 + logs.length, (body as { studyDate: string }).studyDate, 60);
      logs.push(saved);
      return { status: 201, body: { studyLog: saved } };
    }
    return undefined;
  });
}

// The calendar and day requests, in order.
const calendarOf = (api: Api) =>
  api.requests
    .filter((r) => r.path.startsWith('/api/study-logs/calendar') || r.path.includes('?date='))
    .map((r) => r.path);

const logs = [
  log(1, '2026-10-01', 45),
  log(2, '2026-10-22', 90),
  log(3, '2026-10-22', 30, 'planned'),
  log(4, '2026-09-30', 120),
];

const card = () => screen.getByRole('region', { name: 'Study calendar' });
const dayButton = (date: string) =>
  within(card()).getByRole('button', { name: new RegExp(`^${date},`) });
const click = (element: HTMLElement) => fireEvent.click(element);

async function open(...args: Parameters<typeof server>) {
  const api = server(...args);
  render(<Calendar today={today} />);
  await within(card()).findByText('Memo 2');
  return api;
}

test('the calendar shows this month from Sunday with each day’s study time', async () => {
  await open(logs);
  expect(card()).toHaveTextContent(/October 2026/);
  // 2026-10-01 is a Thursday: four empty slots (Sun to Wed) before it (#96).
  const grid = card().querySelector('.calendar-grid')!;
  const slots = Array.from(grid.children).map((n) => n.tagName);
  // Seven weekday names (Sunday first), then four empty slots, then the 1st.
  expect(slots.slice(7, 12)).toEqual(['SPAN', 'SPAN', 'SPAN', 'SPAN', 'BUTTON']);
  expect(dayButton('2026-10-01')).toHaveAccessibleName('2026-10-01, studied 45 min, 1 log');
  // The planned log counts as a log but not as time.
  const todayButton = dayButton(today);
  expect(todayButton).toHaveAccessibleName('2026-10-22, studied 1 h 30 min, 2 logs');
  expect(todayButton).toHaveTextContent(/1\.5 h/);
  expect(todayButton.className).toMatch(/today/);
  expect(todayButton).toHaveAttribute('aria-pressed', 'true');
  expect(dayButton('2026-10-02')).toHaveAccessibleName('2026-10-02, no study, 0 logs');
  // Today's logs are listed under the calendar.
  expect(card()).toHaveTextContent(/Logs for 2026-10-22/);
  expect(card()).toHaveTextContent(/Memo 2/);
  expect(card()).toHaveTextContent(/Memo 3/);
});

test('picking a day lists its logs; a day without any says so', async () => {
  const api = await open(logs);
  click(dayButton('2026-10-01'));
  expect(await within(card()).findByText('Memo 1')).toBeInTheDocument();
  expect(dayButton('2026-10-01')).toHaveAttribute('aria-pressed', 'true');
  expect(calendarOf(api).at(-1)).toBe('/api/study-logs?date=2026-10-01');
  expect(card()).toHaveTextContent(/Logs for 2026-10-01/);
  click(dayButton('2026-10-02'));
  expect(await within(card()).findByText('No logs on this date')).toBeInTheDocument();
});

test('months move back and forth and 이번 달 returns to today', async () => {
  const api = await open(logs);
  click(within(card()).getByRole('button', { name: 'Previous month' }));
  expect(await within(card()).findByText('September 2026')).toBeInTheDocument();
  expect(
    await within(card()).findByRole('button', { name: '2026-09-30, studied 2 h, 1 log' }),
  ).toBeInTheDocument();
  expect(calendarOf(api).at(-1)).toBe('/api/study-logs/calendar?month=2026-09');
  click(within(card()).getByRole('button', { name: 'Next month' }));
  click(within(card()).getByRole('button', { name: 'Next month' }));
  expect(await within(card()).findByText('November 2026')).toBeInTheDocument();
  click(within(card()).getByRole('button', { name: 'This month' }));
  expect(await within(card()).findByText('October 2026')).toBeInTheDocument();
  expect(await within(card()).findByRole('button', { name: /^2026-10-22,/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('saving a log on the page reloads the calendar', async () => {
  const api = server(logs);
  render(<StudyLogs today={today} />);
  await within(card()).findByText('Memo 2');
  const before = calendarOf(api).length;
  fireEvent.change(screen.getByLabelText('Start'), { target: { value: '13:00' } });
  fireEvent.change(screen.getByLabelText('End'), { target: { value: '14:00' } });
  fireEvent.submit(document.querySelector('form')!);
  expect(
    await within(card()).findByRole('button', {
      name: '2026-10-22, studied 2 h 30 min, 3 logs',
    }),
  ).toBeInTheDocument();
  expect(calendarOf(api).slice(before)).toEqual([
    '/api/study-logs/calendar?month=2026-10',
    '/api/study-logs?date=2026-10-22',
  ]);
});

test('a failed calendar load is reported', async () => {
  server(logs, { failCalendar: true });
  render(<Calendar today={today} />);
  expect(
    await within(card()).findByText(/Could not load the calendar: Server error/),
  ).toBeInTheDocument();
});

test('calendar helpers: months, Sunday-first slots and short amounts', () => {
  expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  expect(monthTitle('2026-03')).toBe('March 2026');
  // Sunday first (#96): 2026-03-01 is a Sunday (no empty slot); 2026-06-01 a Monday (one).
  expect(calendarCells([{ date: '2026-03-01' }] as never)[0] !== null).toBe(true);
  expect(
    calendarCells([{ date: '2026-06-01' }] as never).filter((cell) => cell === null).length,
  ).toBe(1);
  // 2026-10-01, a Thursday: four.
  expect(
    calendarCells([{ date: '2026-10-01' }] as never).filter((cell) => cell === null).length,
  ).toBe(4);
  expect([0, 45, 60, 90, 125].map(shortMinutes)).toEqual(['', '45 min', '1 h', '1.5 h', '2.1 h']);
});

test('a failed day and a failed month are reported apart and never hide each other', async () => {
  server(logs, { failDays: ['2026-10-02'], failMonths: ['2026-09'] });
  render(<Calendar today={today} />);
  await within(card()).findByText('Memo 2');
  // Only the day failed: the month stays, the logs area says so instead of loading forever.
  click(dayButton('2026-10-02'));
  expect(await within(card()).findByText(/Could not load the logs: Server error/)).toBeVisible();
  expect(card()).not.toHaveTextContent(/Could not load the calendar/);
  expect(dayButton('2026-10-01')).toBeInTheDocument();
  // Another day loads fine: its logs show and the day error is gone.
  click(dayButton('2026-10-01'));
  expect(await within(card()).findByText('Memo 1')).toBeInTheDocument();
  expect(card()).not.toHaveTextContent(/Could not load the logs/);
  // A failed month is reported as the calendar; its day logs below are unaffected.
  click(within(card()).getByRole('button', { name: 'Previous month' }));
  expect(await within(card()).findByText(/Could not load the calendar/)).toBeInTheDocument();
  expect(card()).toHaveTextContent(/Memo 1/);
  // Back to a month that loads: the month error is not shown there.
  click(within(card()).getByRole('button', { name: 'Next month' }));
  await waitFor(() => expect(card()).not.toHaveTextContent(/Could not load the calendar/));
});
