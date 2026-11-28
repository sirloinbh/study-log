import { fireEvent, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { fakeApi } from './test/fake-api';
import { finishedDays } from './test/finished';
import { render } from './test/render';
import { TwelveWeekView } from './twelve-week-view';
import { weekDays, weekStartOf, weekTotals } from './week-data';
import { WeekView } from './week-view';

const today = '2026-10-23'; // a Friday; its week is Sunday 10-18 to Saturday 10-24

const log = (id: number, studyDate: string, minutes: number, status = 'done') => ({
  id,
  studyDate,
  startTime: '09:00',
  endTime: '10:00',
  durationMinutes: minutes,
  memo: '',
  status,
  textbookId: null,
  textbookTitle: id === 1 ? 'Linear Algebra' : null,
  contentId: null,
  contentNumber: null,
  contentTitle: null,
  finishedContentIds: [],
  understanding: null,
  goalAchieved: null,
  studyType: 'new',
});

test('a week starts on Sunday', () => {
  expect(weekStartOf('2026-10-23')).toBe('2026-10-18');
  expect(weekStartOf('2026-10-18')).toBe('2026-10-18');
});

test('weekDays sums each day, leaves planned logs out of the minutes and keeps empty days', () => {
  const days = weekDays('2026-10-18', [
    log(1, '2026-10-19', 60),
    log(2, '2026-10-19', 30),
    log(3, '2026-10-19', 45, 'planned'),
  ] as never);
  expect(days.map((day) => day.date)).toEqual([
    '2026-10-18',
    '2026-10-19',
    '2026-10-20',
    '2026-10-21',
    '2026-10-22',
    '2026-10-23',
    '2026-10-24',
  ]);
  expect(days[1].minutes).toBe(90);
  expect(days[1].logs).toHaveLength(3);
  expect(days[0]).toMatchObject({ minutes: 0, logs: [] });
});

test('weekTotals gives 12 weeks ending with this one and counts study days', () => {
  const totals = weekTotals(
    [
      { date: '2026-10-18', minutes: 30 },
      { date: '2026-10-19', minutes: 60 },
      { date: '2026-10-20', minutes: 0 },
    ],
    today,
  );
  expect(totals).toHaveLength(12);
  expect(totals.at(-1)).toEqual({
    start: '2026-10-18',
    end: '2026-10-24',
    minutes: 90,
    studyDays: 2,
  });
  expect(totals[0].start).toBe('2026-08-02');
  expect(totals[0].minutes).toBe(0);
});

test('the week view lists the days with their finished counts and moves between weeks', async () => {
  const api = fakeApi({
    'GET /api/study-logs': () => ({ body: { studyLogs: [log(1, '2026-10-19', 60)] } }),
    'GET /api/stats/finished-days': () => ({
      body: finishedDays([
        { date: '2026-10-19', chapters: 1, sections: 3 },
        { date: '2026-10-21', chapters: 0, sections: 1 },
      ]),
    }),
  });
  render(<WeekView today={today} />);
  expect(await screen.findByText('Finished 1 chapter · 4 sections')).toBeInTheDocument();
  expect(screen.getByText('Mon 2026-10-19 · 1 chapter · 3 sections')).toBeInTheDocument();
  expect(screen.getByText('Tue 2026-10-20 · 0 chapters · 0 sections')).toBeInTheDocument();
  // No duration in hours on the week rows; the goal card is the only place for time.
  expect(screen.getByText(/09:00–10:00 · Linear Algebra/)).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(/\d h\b/);
  expect(api.requests.map((r) => r.path)).toContain(
    '/api/stats/finished-days?from=2026-10-18&to=2026-10-24',
  );
  expect(screen.getByRole('heading', { name: '2026-10-18 – 2026-10-24' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
  expect(
    await screen.findByRole('heading', { name: '2026-10-11 – 2026-10-17' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'This week' }));
  expect(
    await screen.findByRole('heading', { name: '2026-10-18 – 2026-10-24' }),
  ).toBeInTheDocument();
});

test('the week view shows a load error as an alert', async () => {
  fakeApi({
    'GET /api/study-logs': { status: 500, body: { error: 'Test server' } },
    'GET /api/stats/finished-days': { body: finishedDays() },
  });
  render(<WeekView today={today} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the week');
});

test('the week view also reports a failed finished-counts load', async () => {
  fakeApi({
    'GET /api/study-logs': { body: { studyLogs: [] } },
    'GET /api/stats/finished-days': { status: 500, body: { error: 'Counts down' } },
  });
  render(<WeekView today={today} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Counts down');
});

test('the 12-week view shows one row per week', async () => {
  fakeApi({
    'GET /api/stats/finished-days': {
      body: {
        from: '2026-08-02',
        to: today,
        daily: [
          { date: '2026-10-19', chapters: 1, sections: 2 },
          { date: '2026-10-20', chapters: 0, sections: 3 },
        ],
      },
    },
  });
  render(<TwelveWeekView today={today} />);
  expect(await screen.findByText('2 of 7 days')).toBeInTheDocument();
  expect(screen.getByText('1 chapter')).toBeInTheDocument();
  expect(screen.getByText('5 sections')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(/\d h\b/);
  expect(screen.getAllByRole('listitem')).toHaveLength(12);
  // The first row names its year, and the current week is named in text.
  const rows = screen.getAllByRole('listitem');
  expect(rows[0]).toHaveTextContent(/^\d\d-\d\d – \d\d-\d\d20\d\d/);
  expect(rows[11]).toHaveTextContent('This week');
  expect(rows[11]).toHaveAttribute('aria-current', 'date');
  expect(rows.filter((row) => row.hasAttribute('aria-current'))).toHaveLength(1);
});

test('the 12-week view shows the year again where it changes', async () => {
  fakeApi({
    'GET /api/stats/finished-days': { body: { from: '2025-10-19', to: '2026-01-10', daily: [] } },
  });
  render(<TwelveWeekView today="2026-01-10" />);
  await screen.findAllByRole('listitem');
  const years = screen
    .getAllByRole('listitem')
    .flatMap((row) => row.textContent?.match(/20\d\d/) ?? []);
  expect(years).toEqual(['2025', '2026']);
});

test('the 12-week captions are never smaller than 13px', async () => {
  fakeApi({
    'GET /api/stats/finished-days': {
      body: {
        from: '2026-08-02',
        to: today,
        daily: [{ date: '2026-10-19', chapters: 1, sections: 0 }],
      },
    },
  });
  render(<TwelveWeekView today={today} />);
  await screen.findAllByRole('listitem');
  expect(document.querySelectorAll('.text-xs')).toHaveLength(0);
  expect(screen.getAllByText(/of 7 days/)[0]).toHaveClass('text-[13px]');
});

test('the week card has its own landmark name, not the page name', async () => {
  fakeApi({
    'GET /api/study-logs': { body: { studyLogs: [] } },
    'GET /api/stats/finished-days': { body: finishedDays() },
  });
  render(<WeekView today={today} />);
  expect(await screen.findByRole('region', { name: 'Days of the week' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Week' })).toBeNull();
});
