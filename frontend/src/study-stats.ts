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
