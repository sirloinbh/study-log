import { Router } from 'express';
import type { Pool } from 'pg';

import { inSnapshot } from './sql.js';
import { addDays, counted } from './stats.js';

// One fixed goal for every day (#479): 2 hours, with no weekday, weekend or holiday difference.
export const dailyGoalMinutes = 120;

// /api/stats/goal (#361, #479): today's goal, the minutes studied today, the achievement rate, and
// the streak of study days. A study day is a day with a log that is not planned, the same rule as
// the dashboard's study days. The streak ends on today, or on yesterday while today has no study
// yet, so it only breaks when a whole day passes without any. The old weekly_goals table is dropped by
// migration 037.
export function studyGoalRoutes(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const to = today();
    const result = await inSnapshot(pool, async (db) => {
      const studied = await db.query<{ minutes: number }>(
        `SELECT COALESCE(sum(duration_minutes), 0)::int AS minutes FROM study_logs
         WHERE ${counted} AND study_date = $2`,
        [to, to],
      );
      // The newest run of consecutive study days, found as dates minus their row number.
      const run = await db.query<{ lastDay: string; days: number }>(
        `WITH days AS (
           SELECT DISTINCT study_date AS day FROM study_logs WHERE ${counted}
         ), runs AS (
           SELECT day, day - (row_number() OVER (ORDER BY day))::int AS grp FROM days
         )
         SELECT to_char(max(day), 'YYYY-MM-DD') AS "lastDay", count(*)::int AS days
         FROM runs GROUP BY grp ORDER BY max(day) DESC LIMIT 1`,
        [to],
      );
      const today_ = await db.query(
        "SELECT 1 FROM study_logs WHERE status <> 'planned' AND study_date = $1 LIMIT 1",
        [to],
      );
      return {
        studied: studied.rows[0].minutes,
        run: run.rows[0],
        studiedToday: !!today_.rowCount,
      };
    });
    const { studied, run, studiedToday } = result;
    const live = run && (run.lastDay === to || run.lastDay === addDays(to, -1));
    res.json({
      date: to,
      goalMinutes: dailyGoalMinutes,
      studiedMinutes: studied,
      achievementRate: Math.round((studied * 100) / dailyGoalMinutes),
      streakDays: live ? run.days : 0,
      studiedToday,
    });
  });

  return router;
}
