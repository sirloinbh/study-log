import { shiftDays } from './retrospective';
import { weekdayNames } from './study-stats';

// The responses of /api/schedules (#34).
export type Schedule = {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  weekdayMinutes: number;
  restDayMinutes: number;
  textbookId: number | null;
  textbookTitle: string | null;
  totalMinutes: number;
  itemCount: number;
  // The later of the end first chosen and the last day, and how far past it that is (rule 4장).
  currentEndDate: string;
  delayDays: number;
};

export type ScheduleChapter = { id: number; number: string; title: string };

export type ScheduleItem = {
  id: number;
  date: string;
  targetMinutes: number;
  completedOn: string | null;
  contents: ScheduleChapter[];
};

export type ScheduleDetail = { schedule: Schedule; items: ScheduleItem[] };

// Filled in on the form; each schedule keeps its own (docs/decisions/schedule-rules.md 1장).
export const defaultHours = { weekday: '2', restDay: '5' };

// Thirty days from the start, both ends counted.
export const defaultEnd = (start: string) => shiftDays(start, 29);

// Hours as typed into minutes, or undefined when they are not 0 to 24. The API stores minutes.
export function hoursToMinutes(text: string) {
  const hours = Number(text);
  if (text.trim() === '' || !Number.isFinite(hours) || hours < 0 || hours > 24) return undefined;
  return Math.round(hours * 60);
}

// What each day is called to a screen reader: days can share a date (rule 4장), so those are told
// apart by their order.
export function dayNames(items: { id: number; date: string }[], startDate: string) {
  const names = new Map<number, string>();
  items.forEach((item) => {
    const same = items.filter((other) => other.date === item.date);
    const label = dayLabel(item.date, startDate);
    names.set(item.id, same.length > 1 ? `${label} ${same.indexOf(item) + 1}번째` : label);
  });
  return names;
}

// "3월 2일 (월)". A schedule can run for a year, so a day in another year than its start says which.
export function dayLabel(date: string, startDate: string) {
  const day = new Date(`${date}T00:00:00Z`);
  const year = date.slice(0, 4) === startDate.slice(0, 4) ? '' : `${date.slice(0, 4)}년 `;
  return `${year}${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일 (${weekdayNames[day.getUTCDay()]})`;
}
