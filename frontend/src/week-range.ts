import type { DayMinutes } from './study-stats';

const dayMs = 24 * 60 * 60 * 1000;

const toTime = (day: string) => Date.parse(`${day}T00:00:00Z`);

// "2026-11-26" moved by `delta` days.
export function addDays(day: string, delta: number) {
  return new Date(toTime(day) + delta * dayMs).toISOString().slice(0, 10);
}

// The Sunday on or before `day`; weeks run Sunday to Saturday like the calendar and the heatmap (#96).
export const weekStart = (day: string) => addDays(day, -new Date(toTime(day)).getUTCDay());

// The seven dates of the week that starts on `start`.
export const weekDays = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

// "Nov 22 – Nov 28" for the week that starts on `start`.
export function weekTitle(start: string) {
  const format = (day: string) =>
    new Date(toTime(day)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  return `${format(start)} – ${format(addDays(start, 6))}`;
}

export type WeekTotal = { start: string; minutes: number; studyDays: number };

// The `count` weeks that end with the week of `today`, newest first, with the minutes and the
// number of study days in each. Days missing from `daily` count as no study.
export function recentWeeks(daily: DayMinutes[], today: string, count: number): WeekTotal[] {
  const byDay = new Map(daily.map((day) => [day.date, day.minutes]));
  const first = weekStart(today);
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(first, -7 * i);
    const minutes = weekDays(start).map((day) => byDay.get(day) ?? 0);
    return {
      start,
      minutes: minutes.reduce((sum, value) => sum + value, 0),
      studyDays: minutes.filter((value) => value > 0).length,
    };
  });
}
