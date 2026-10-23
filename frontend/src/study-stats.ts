export const statPeriods = ['week', 'month', '3months', 'all'] as const;
export type StatPeriod = (typeof statPeriods)[number];

export const periodLabels: Record<StatPeriod, string> = {
  week: '이번 주',
  month: '이번 달',
  '3months': '최근 3개월',
  all: '전체',
};

// The response of GET /api/stats/study-time (#47).
export type StudyTimeStats = {
  period: StatPeriod;
  from: string;
  to: string;
  totalMinutes: number;
  todayMinutes: number;
  cumulativeMinutes: number;
  days: number;
  studyDays: number;
  averageMinutesPerDay: number;
  averageMinutesPerStudyDay: number;
  daily: { date: string; minutes: number }[];
  weekly: { weekStart: string; minutes: number }[];
  monthly: { month: string; minutes: number }[];
};

export type DayMinutes = { date: string; minutes: number };

// Intensity levels of the heatmap (#50), by fixed bands rather than relative to the busiest day,
// so a level means the same thing every week: 0 none, 1 under 30 minutes, 2 under an hour,
// 3 under two hours, 4 two hours or more.
export const heatBands = [
  { level: 0, label: '0분' },
  { level: 1, label: '30분 미만' },
  { level: 2, label: '30분~1시간' },
  { level: 3, label: '1~2시간' },
  { level: 4, label: '2시간 이상' },
] as const;

export function heatLevel(minutes: number) {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
}

// The days as week columns of seven (Sunday first, #96). `daily` starts on a Sunday; the days after
// the last one (the rest of this week) are null.
export function heatWeeks(daily: DayMinutes[]) {
  const weeks: (DayMinutes | null)[][] = [];
  for (let start = 0; start < daily.length; start += 7) {
    const week: (DayMinutes | null)[] = daily.slice(start, start + 7);
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

// "10월" above the first week that holds the 1st of a month, otherwise nothing.
export function monthLabel(week: (DayMinutes | null)[]) {
  const first = week.find((day) => day?.date.endsWith('-01'));
  return first ? `${Number(first.date.slice(5, 7))}월` : '';
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

export const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];

// "20시~21시" for the hour starting at 20.
export const hourLabel = (hour: number) => `${hour}시~${(hour + 1) % 24}시`;

// A bar's share of the largest value, as a CSS width; 0 when nothing was studied.
export const barWidth = (value: number, values: number[]) => {
  const most = Math.max(...values);
  return most > 0 ? `${Math.round((value / most) * 100)}%` : '0%';
};

// Study time chart (#49): one bar per day, week (from its Sunday) or month.
export const chartUnits = ['day', 'week', 'month'] as const;
export type ChartUnit = (typeof chartUnits)[number];
export const chartUnitLabels: Record<ChartUnit, string> = { day: '일', week: '주', month: '월' };
// Bars that stay readable for each period: days for a week or month, weeks for three months,
// months for everything.
export const defaultChartUnit: Record<StatPeriod, ChartUnit> = {
  week: 'day',
  month: 'day',
  '3months': 'week',
  all: 'month',
};

export type ChartBar = { key: string; label: string; minutes: number; hours: number };

const monthDay = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

export function chartBars(stats: StudyTimeStats, unit: ChartUnit): ChartBar[] {
  const bar = (key: string, label: string, minutes: number) => ({
    key,
    label,
    minutes,
    hours: Math.round((minutes / 60) * 10) / 10,
  });
  if (unit === 'day') return stats.daily.map((d) => bar(d.date, monthDay(d.date), d.minutes));
  if (unit === 'week')
    return stats.weekly.map((w) => bar(w.weekStart, `${monthDay(w.weekStart)}~`, w.minutes));
  return stats.monthly.map((m) =>
    bar(m.month, `${m.month.slice(2, 4)}.${m.month.slice(5, 7)}`, m.minutes),
  );
}

// The bar with the most study time, the earliest on a tie; none when nothing was studied.
export function busiestBar(bars: ChartBar[]) {
  return bars.reduce<ChartBar | undefined>(
    (best, bar) => (bar.minutes > (best?.minutes ?? 0) ? bar : best),
    undefined,
  );
}
