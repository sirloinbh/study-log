import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

export const statPeriods = ['week', 'month', '3months', 'all'] as const;
export type StatPeriod = (typeof statPeriods)[number];

const query = z.object({
  period: z
    .enum(statPeriods, {
      errorMap: () => ({ message: '기간은 이번 주, 이번 달, 최근 3개월, 전체 중에서 고르세요' }),
    })
    .default('week'),
});

// Calendar arithmetic on YYYY-MM-DD strings in UTC, so no local time zone shifts a day.
const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (day: string, days: number) => {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return toDay(date);
};

// Weeks start on Monday.
export const weekStart = (day: string) => addDays(day, -((toDate(day).getUTCDay() + 6) % 7));

// The longest series "all" returns, in days (about ten years). Study dates as early as year 1 are
// accepted, so without a bound one such log would make every request build hundreds of
// thousands of days. The all-time total still counts every log.
export const maxSeriesDays = 3653;

// The first day of a period ending today (#47). "Recent 3 months" starts the day after the same
// day three months back (a day missing in that month counts as its last day), so it spans three
// full months. "All" starts at the first counted log, or today when there is none, but no more
// than `maxSeriesDays` back.
export function periodStart(period: StatPeriod, today: string, firstLog?: string) {
  if (period === 'week') return weekStart(today);
  if (period === 'month') return `${today.slice(0, 8)}01`;
  if (period === 'all') {
    const earliest = addDays(today, -(maxSeriesDays - 1));
    if (!firstLog || firstLog >= today) return today;
    return firstLog < earliest ? earliest : firstLog;
  }
  const [year, month, day] = today.split('-').map(Number);
  const back = new Date(Date.UTC(year, month - 1 - 3, 1));
  const lastDay = new Date(Date.UTC(back.getUTCFullYear(), back.getUTCMonth() + 1, 0)).getUTCDate();
  back.setUTCDate(Math.min(day, lastDay));
  return addDays(toDay(back), 1);
}

type Day = { date: string; minutes: number };

// Sums of the daily series by week (keyed by its Monday) and by month (YYYY-MM), in order. The
// first and last buckets may cover only part of their week or month.
export function bucket(daily: Day[], keyOf: (date: string) => string) {
  const sums = new Map<string, number>();
  for (const { date, minutes } of daily) {
    const key = keyOf(date);
    sums.set(key, (sums.get(key) ?? 0) + minutes);
  }
  return [...sums].map(([key, minutes]) => ({ key, minutes }));
}

// Planned sessions have not been studied yet, so they do not count; later dates neither.
const counted = `status <> 'planned' AND study_date <= $1`;

// Study time statistics (#47): /api/stats/study-time?period=week|month|3months|all
export function statsRoutes(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/study-time', async (req, res) => {
    const { period } = query.parse(req.query);
    const to = today();
    const totals = await pool.query<{ first: string | null; cumulative: number }>(
      `SELECT min(study_date) AS first, COALESCE(sum(duration_minutes), 0)::int AS cumulative
       FROM study_logs WHERE ${counted}`,
      [to],
    );
    const { first, cumulative } = totals.rows[0];
    const from = periodStart(period, to, first ?? undefined);
    const { rows: daily } = await pool.query<Day>(
      `SELECT day::date AS date, COALESCE(sum(l.duration_minutes), 0)::int AS minutes
       FROM generate_series($2::date, $1::date, interval '1 day') AS day
       LEFT JOIN study_logs l ON l.study_date = day::date AND l.status <> 'planned'
       GROUP BY day ORDER BY day`,
      [to, from],
    );
    const totalMinutes = daily.reduce((sum, day) => sum + day.minutes, 0);
    const studyDays = daily.filter((day) => day.minutes > 0).length;
    res.json({
      period,
      from,
      to,
      totalMinutes,
      todayMinutes: daily.at(-1)?.minutes ?? 0,
      cumulativeMinutes: cumulative,
      days: daily.length,
      studyDays,
      // Over every day of the period, studied or not; and over the studied days only.
      averageMinutesPerDay: Math.round(totalMinutes / daily.length),
      averageMinutesPerStudyDay: studyDays ? Math.round(totalMinutes / studyDays) : 0,
      daily,
      weekly: bucket(daily, weekStart).map(({ key, minutes }) => ({ weekStart: key, minutes })),
      monthly: bucket(daily, (date) => date.slice(0, 7)).map(({ key, minutes }) => ({
        month: key,
        minutes,
      })),
    });
  });

  return router;
}
