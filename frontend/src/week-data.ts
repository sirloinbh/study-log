import { shiftDays } from './retrospective';
import type { StudyLog } from './study-logs-data';

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
