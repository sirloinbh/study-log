import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

import { isCalendarDate } from './study-logs.js';

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

// Weeks start on Sunday (#96, the user's choice; it was Monday before).
export const weekStart = (day: string) => addDays(day, -toDate(day).getUTCDay());

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

// Sums of the daily series by week (keyed by its Sunday) and by month (YYYY-MM), in order. The
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

// Minutes studied on every day from `from` to `to`, a day without study as 0.
const dailyMinutes = async (pool: Pool, from: string, to: string) =>
  (
    await pool.query<Day>(
      `SELECT day::date AS date, COALESCE(sum(l.duration_minutes), 0)::int AS minutes
       FROM generate_series($2::date, $1::date, interval '1 day') AS day
       LEFT JOIN study_logs l ON l.study_date = day::date AND l.status <> 'planned'
       GROUP BY day ORDER BY day`,
      [to, from],
    )
  ).rows;

// The heatmap's weeks (#50): this week and the 52 before it, each from Sunday.
export const heatmapWeeks = 53;
export const heatmapStart = (today: string) => addDays(weekStart(today), -7 * (heatmapWeeks - 1));

// The study pattern of a set of sessions (#20): minutes per hour of the day, spread over the
// hours actually studied (20:30 to 22:00 gives 30 minutes to 20h and 60 to 21h; past midnight
// continues at 0h), and minutes per weekday of the session's date (Sunday first, #96).
export function studyPattern(
  sessions: { studyDate: string; startTime: string; durationMinutes: number }[],
) {
  const byHour = Array<number>(24).fill(0);
  const byWeekday = Array<number>(7).fill(0);
  for (const session of sessions) {
    byWeekday[toDate(session.studyDate).getUTCDay()] += session.durationMinutes;
    let minute = Number(session.startTime.slice(0, 2)) * 60 + Number(session.startTime.slice(3, 5));
    let left = session.durationMinutes;
    while (left > 0) {
      const hour = Math.floor(minute / 60) % 24;
      const inHour = Math.min(left, 60 - (minute % 60));
      byHour[hour] += inHour;
      left -= inHour;
      minute += inHour;
    }
  }
  // The busiest hour and weekday, the earliest on a tie; none without any study.
  const top = (values: number[]) => {
    const most = Math.max(...values);
    return most > 0 ? values.indexOf(most) : null;
  };
  return {
    totalMinutes: byWeekday.reduce((sum, minutes) => sum + minutes, 0),
    byHour,
    byWeekday,
    topHour: top(byHour),
    topWeekday: top(byWeekday),
  };
}

// The dates of a pattern request, within the years the other date APIs accept and at most
// `maxSeriesDays` long, like the stats series.
const patternQuery = z
  .object({
    from: z
      .string({ invalid_type_error: '시작일 형식이 올바르지 않습니다' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, '시작일은 YYYY-MM-DD 형식으로 입력하세요')
      .refine(isCalendarDate, '존재하지 않는 날짜입니다')
      .optional(),
    to: z
      .string({ invalid_type_error: '종료일 형식이 올바르지 않습니다' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, '종료일은 YYYY-MM-DD 형식으로 입력하세요')
      .refine(isCalendarDate, '존재하지 않는 날짜입니다')
      .optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: '시작일은 종료일보다 늦을 수 없습니다',
  });

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
    const daily = await dailyMinutes(pool, from, to);
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

  // Every day of the heatmap's weeks up to today (#50): /api/stats/heatmap
  router.get('/heatmap', async (_req, res) => {
    const to = today();
    const from = heatmapStart(to);
    res.json({ from, to, daily: await dailyMinutes(pool, from, to) });
  });

  // The study pattern from ?from to ?to (#20); by default the last 3 months up to today.
  router.get('/patterns', async (req, res) => {
    const query = patternQuery.parse(req.query);
    const to = query.to ?? today();
    const from = query.from ?? periodStart('3months', to);
    if (toDate(to).getTime() - toDate(from).getTime() >= maxSeriesDays * 86_400_000)
      return void res.status(400).json({ error: '기간은 10년 이내로 지정하세요' });
    const { rows } = await pool.query<{
      studyDate: string;
      startTime: string;
      durationMinutes: number;
    }>(
      `SELECT study_date AS "studyDate", to_char(start_time, 'HH24:MI') AS "startTime",
         duration_minutes AS "durationMinutes"
       FROM study_logs WHERE status <> 'planned' AND study_date BETWEEN $1 AND $2`,
      [from, to],
    );
    res.json({ from, to, ...studyPattern(rows) });
  });

  return router;
}
