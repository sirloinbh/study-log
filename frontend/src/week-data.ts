import { shiftDays } from './retrospective';
import type { StudyLog } from './study-logs-data';
import type { DayMinutes } from './study-stats';

// Weeks start on Sunday (#96), like the heatmap, the stats and the retrospectives.
export const weekStartOf = (day: string) =>
  shiftDays(day, -new Date(`${day}T00:00:00Z`).getUTCDay());

// How many weeks the 12-week view shows: this week and the 11 before it.
export const twelveWeeks = 12;

export type WeekDay = { date: string; minutes: number; logs: StudyLog[] };

// The seven days of the week starting `start`, each with its logs and the minutes studied. A
// planned log is not studied yet, so it is listed but not counted (as in the stats).
export function weekDays(start: string, logs: StudyLog[]): WeekDay[] {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = shiftDays(start, offset);
    const own = logs
      .filter((log) => log.studyDate === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const minutes = own
      .filter((log) => log.status !== 'planned')
      .reduce((sum, log) => sum + log.durationMinutes, 0);
    return { date, minutes, logs: own };
  });
}

export type WeekTotal = { start: string; end: string; minutes: number; studyDays: number };

// The last 12 weeks (oldest first) from the heatmap's daily series, which ends today and starts
// on a Sunday. A week with no data in the series counts as 0.
export function weekTotals(daily: DayMinutes[], today: string): WeekTotal[] {
  const byDate = new Map(daily.map((day) => [day.date, day.minutes]));
  const thisWeek = weekStartOf(today);
  return Array.from({ length: twelveWeeks }, (_, index) => {
    const start = shiftDays(thisWeek, -7 * (twelveWeeks - 1 - index));
    let minutes = 0;
    let studyDays = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const studied = byDate.get(shiftDays(start, offset)) ?? 0;
      minutes += studied;
      if (studied > 0) studyDays += 1;
    }
    return { start, end: shiftDays(start, 6), minutes, studyDays };
  });
}
