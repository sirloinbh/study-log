import { addDays } from './components/period-nav/periods';
import { plural } from './lib/format';
import type { ChartUnit, StatPeriod } from './study-stats';
import { twelveWeeks, weekStartOf } from './week-data';

// What the stats screens count (#481): chapters (top-level entries of a textbook) and sections
// (the entries below them) finished, each entry once on the date of its first done log. They come
// from GET /api/stats/finished-contents (#480).
export type Finished = { chapters: number; sections: number };
export type FinishedDay = Finished & { date: string };

export type FinishedStats = Finished & {
  period: StatPeriod;
  from: string;
  to: string;
  totalChapters: number;
  totalSections: number;
  todayChapters: number;
  todaySections: number;
  cumulativeChapters: number;
  cumulativeSections: number;
  days: number;
  daily: FinishedDay[];
  weekly: (Finished & { weekStart: string })[];
  monthly: (Finished & { month: string })[];
};

// `textbookId` '' for every textbook, or one textbook's.
export const finishedPath = (period: StatPeriod, textbookId = '') =>
  `/api/stats/finished-contents?period=${period}${textbookId ? `&textbookId=${textbookId}` : ''}`;

export const finishedTotal = (value: Finished) => value.chapters + value.sections;

// "2 chapters · 1 section"
export const finishedLabel = (value: Finished) =>
  `${plural(value.chapters, 'chapter')} · ${plural(value.sections, 'section')}`;

// One decimal, without a trailing ".0".
export const perDay = (count: number, days: number) =>
  days ? String(Math.round((count / days) * 10) / 10) : '0';

export type FinishedBar = Finished & { key: string; label: string; total: number };

const monthDay = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

export function finishedBars(stats: FinishedStats, unit: ChartUnit): FinishedBar[] {
  const bar = (key: string, label: string, value: Finished) => ({
    key,
    label,
    chapters: value.chapters,
    sections: value.sections,
    total: finishedTotal(value),
  });
  if (unit === 'day') return stats.daily.map((day) => bar(day.date, monthDay(day.date), day));
  if (unit === 'week')
    return stats.weekly.map((week) => bar(week.weekStart, `${monthDay(week.weekStart)}~`, week));
  return stats.monthly.map((month) =>
    bar(month.month, `${month.month.slice(2, 4)}.${month.month.slice(5, 7)}`, month),
  );
}

// The bar with the most finished entries, the earliest on a tie; none when nothing was finished.
export const busiestFinished = (bars: FinishedBar[]) =>
  bars.reduce<FinishedBar | undefined>(
    (best, bar) => (bar.total > (best?.total ?? 0) ? bar : best),
    undefined,
  );

// Heatmap levels by the entries finished that day, in fixed bands like the old minute bands:
// 0 none, 1 one, 2 two, 3 three or four, 4 five or more.
export const finishedHeatBands = [
  { level: 0, label: 'None' },
  { level: 1, label: '1 finished' },
  { level: 2, label: '2 finished' },
  { level: 3, label: '3–4 finished' },
  { level: 4, label: '5 or more' },
] as const;

export function finishedHeatLevel(count: number) {
  if (count <= 0) return 0;
  if (count <= 2) return count;
  return count <= 4 ? 3 : 4;
}

// The last 12 weeks, oldest first, from a daily series that ends today and starts on a Sunday.
export type FinishedWeek = Finished & { start: string; end: string; finishedDays: number };

export function finishedWeeks(daily: FinishedDay[], today: string): FinishedWeek[] {
  const byDate = new Map(daily.map((day) => [day.date, day]));
  const thisWeek = weekStartOf(today);
  return Array.from({ length: twelveWeeks }, (_, index) => {
    const start = addDays(thisWeek, -7 * (twelveWeeks - 1 - index));
    let chapters = 0;
    let sections = 0;
    let finishedDays = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const day = byDate.get(addDays(start, offset));
      chapters += day?.chapters ?? 0;
      sections += day?.sections ?? 0;
      if (day && finishedTotal(day) > 0) finishedDays += 1;
    }
    return { start, end: addDays(start, 6), chapters, sections, finishedDays };
  });
}
