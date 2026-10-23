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

// The days as week columns of seven (Monday first). `daily` starts on a Monday; the days after
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
