import { fireEvent, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { fakeApi } from './test/fake-api';
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
  understanding: null,
  difficulties: '',
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

test('the week view lists the days and moves between weeks', async () => {
  fakeApi({
    'GET /api/study-logs': () => ({ body: { studyLogs: [log(1, '2026-10-19', 60)] } }),
  });
  render(<WeekView today={today} />);
  expect(await screen.findByText('Total 1 h')).toBeInTheDocument();
  expect(screen.getByText('Mon 2026-10-19 · 1 h')).toBeInTheDocument();
  expect(screen.getByText(/09:00–10:00 \(1 h\) · Linear Algebra/)).toBeInTheDocument();
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
  fakeApi({ 'GET /api/study-logs': { status: 500, body: { error: 'Test server' } } });
  render(<WeekView today={today} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the week');
});

test('the 12-week view shows one row per week', async () => {
  fakeApi({
    'GET /api/stats/heatmap': {
      body: {
        from: '2026-08-02',
        to: today,
        daily: [
          { date: '2026-10-19', minutes: 90 },
          { date: '2026-10-20', minutes: 30 },
        ],
      },
    },
  });
  render(<TwelveWeekView today={today} />);
  expect(await screen.findByText('2 of 7 days')).toBeInTheDocument();
  expect(screen.getByText('2 h')).toBeInTheDocument();
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
    'GET /api/stats/heatmap': { body: { from: '2025-10-19', to: '2026-01-10', daily: [] } },
  });
  render(<TwelveWeekView today="2026-01-10" />);
  await screen.findAllByRole('listitem');
  const years = screen
    .getAllByRole('listitem')
    .flatMap((row) => row.textContent?.match(/20\d\d/) ?? []);
  expect(years).toEqual(['2025', '2026']);
});

test('the week card has its own landmark name, not the page name', async () => {
  fakeApi({ 'GET /api/study-logs': { body: { studyLogs: [] } } });
  render(<WeekView today={today} />);
  expect(await screen.findByRole('region', { name: 'Days of the week' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Week' })).toBeNull();
});
