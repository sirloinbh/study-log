export const statPeriods = ['week', 'month', '3months', 'all'] as const;
export type StatPeriod = (typeof statPeriods)[number];

export const periodLabels: Record<StatPeriod, string> = {
  week: 'This week',
  month: 'This month',
  '3months': 'Last 3 months',
  all: 'All',
};

// GET /api/stats/reviews (#46). `completionRate` is a whole percent, null with nothing scheduled.
export type ReviewStats = {
  period: StatPeriod;
  from: string;
  to: string;
  scheduled: number;
  completed: number;
  delayed: number;
  completionRate: number | null;
};

// The bars of the review chart (#52). Late rounds also count as scheduled, and as completed when
// they were done late, so these are three separate counts rather than parts of a whole. The label
// carries the count, since a bar of 0 draws nothing to read.
export const reviewBars = (stats: ReviewStats) =>
  (
    [
      ['Scheduled', stats.scheduled],
      ['Done', stats.completed],
      ['Delayed', stats.delayed],
    ] as const
  ).map(([name, count]) => ({ label: `${name} ${count}`, count }));

// The days as week columns of seven (Sunday first, #96). `daily` starts on a Sunday; the days after
// the last one (the rest of this week) are null.
export function heatWeeks<T extends { date: string }>(daily: T[]) {
  const weeks: (T | null)[][] = [];
  for (let start = 0; start < daily.length; start += 7) {
    const week: (T | null)[] = daily.slice(start, start + 7);
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

// "Oct" above the first week that holds the 1st of a month, otherwise nothing.
export function monthLabel<T extends { date: string }>(week: (T | null)[]) {
  const first = week.find((day) => day?.date.endsWith('-01'));
  return first
    ? new Date(`${first.date}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        timeZone: 'UTC',
      })
    : '';
}

// GET /api/stats/patterns (#20): minutes per hour (0 to 23) and per weekday (Sunday first).
export type StudyPattern = {
  from: string;
  to: string;
  totalMinutes: number;
  byHour: number[];
  byWeekday: number[];
  topHour: number | null;
  topWeekday: number | null;
};

// The response of GET /api/stats/textbooks (#51).
export type TextbookStats = {
  textbooks: {
    id: number;
    title: string;
    completedChapters: number;
    totalChapters: number;
    completedSections: number;
    totalSections: number;
  }[];
  schedule: {
    plannedMinutes: number;
    achievedMinutes: number;
    achievementRate: number | null;
    dueDays: number;
    onTimeDays: number;
    adherenceRate: number | null;
  };
};

export const textbookStatsPath = (textbookId: string) =>
  `/api/stats/textbooks${textbookId ? `?textbookId=${textbookId}` : ''}`;

export const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "20:00–21:00" for the hour starting at 20.
const clockHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
export const hourLabel = (hour: number) => `${clockHour(hour)}–${clockHour((hour + 1) % 24)}`;

// A bar's share of the largest value, as a CSS width; 0 when nothing was studied.
export const barWidth = (value: number, values: number[]) => {
  const most = Math.max(...values);
  return most > 0 ? `${Math.round((value / most) * 100)}%` : '0%';
};

// The chart of finished chapters and sections (#49, #481): one bar per day, week (from its Sunday) or month.
export const chartUnits = ['day', 'week', 'month'] as const;
export type ChartUnit = (typeof chartUnits)[number];
export const chartUnitLabels: Record<ChartUnit, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};
// Bars that stay readable for each period: days for a week or month, weeks for three months,
// months for everything.
export const defaultChartUnit: Record<StatPeriod, ChartUnit> = {
  week: 'day',
  month: 'day',
  '3months': 'week',
  all: 'month',
};

// What each cell looks like by level (#347): empty, two tints of the text colour, then the ring and primary
// colours. A level that is in the future draws nothing. The tests check that every level has its own look.
export const heatCellStyle: Record<string, string> = {
  '0': 'bg-muted outline outline-1 -outline-offset-1 outline-border',
  '1': 'bg-[color-mix(in_oklch,var(--foreground)_9%,transparent)]',
  '2': 'bg-[color-mix(in_oklch,var(--foreground)_18%,transparent)]',
  '3': 'bg-ring',
  '4': 'bg-primary',
  future: 'bg-transparent',
};
