import { expect, test } from 'vitest';

import { addDays, recentWeeks, weekDays, weekStart, weekTitle } from './week-range';

test('weeks run Sunday to Saturday', () => {
  expect(weekStart('2026-11-26')).toBe('2026-11-22');
  expect(weekStart('2026-11-22')).toBe('2026-11-22');
  expect(weekStart('2026-11-28')).toBe('2026-11-22');
  expect(weekDays('2026-11-22')).toHaveLength(7);
  expect(weekDays('2026-11-22')[6]).toBe('2026-11-28');
  expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  expect(weekTitle('2026-11-22')).toBe('Nov 22 – Nov 28');
});

test('recentWeeks totals each of the last weeks, newest first', () => {
  const weeks = recentWeeks(
    [
      { date: '2026-11-26', minutes: 60 },
      { date: '2026-11-23', minutes: 30 },
      { date: '2026-11-15', minutes: 45 },
    ],
    '2026-11-26',
    3,
  );
  expect(weeks).toEqual([
    { start: '2026-11-22', minutes: 90, studyDays: 2 },
    { start: '2026-11-15', minutes: 45, studyDays: 1 },
    { start: '2026-11-08', minutes: 0, studyDays: 0 },
  ]);
});
