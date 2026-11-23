import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { auditChange } from './audit-log.js';
import { inSnapshot, inTransaction } from './sql.js';
import { addDays, counted, weekStart } from './stats.js';

export const goalInput = z.object(
  {
    minutes: z
      .number({ error: 'Enter the goal in minutes' })
      .int('The goal must be a whole number of minutes')
      .min(1, 'The goal must be at least 1 minute')
      .max(10080, 'The goal must be at most 10080 minutes (7 days)'),
  },
  { error: 'The request body format is invalid' },
);

type Db = Pick<Pool | PoolClient, 'query'>;

// This week's goal: its own row, else the latest one before it, else none.
async function goalFor(db: Db, week: string) {
  const { rows } = await db.query<{ weekStart: string; goalMinutes: number }>(
    `SELECT to_char(week_start, 'YYYY-MM-DD') AS "weekStart", goal_minutes AS "goalMinutes"
     FROM weekly_goals WHERE week_start <= $1 ORDER BY week_start DESC LIMIT 1`,
    [week],
  );
  return rows[0];
}

// /api/stats/goal (#361): the goal of this week (Sunday to Saturday), the minutes studied so far
// this week, the achievement rate, and the streak of study days. A study day is a day with a log
// that is not planned, the same rule as the dashboard's study days. The streak ends on today, or on
// yesterday while today has no study yet, so it only breaks when a whole day passes without any.
export function studyGoalRoutes(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const to = today();
    const week = weekStart(to);
    const result = await inSnapshot(pool, async (db) => {
      const goal = await goalFor(db, week);
      const studied = await db.query<{ minutes: number }>(
        `SELECT COALESCE(sum(duration_minutes), 0)::int AS minutes FROM study_logs
         WHERE ${counted} AND study_date >= $2`,
        [to, week],
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
        goal,
        studied: studied.rows[0].minutes,
        run: run.rows[0],
        studiedToday: !!today_.rowCount,
      };
    });
    const { goal, studied, run, studiedToday } = result;
    const live = run && (run.lastDay === to || run.lastDay === addDays(to, -1));
    res.json({
      weekStart: week,
      weekEnd: addDays(week, 6),
      goalMinutes: goal?.goalMinutes ?? null,
      // The week the goal was set in; earlier than this week when it carries over.
      goalSince: goal?.weekStart ?? null,
      studiedMinutes: studied,
      achievementRate: goal ? Math.round((studied * 100) / goal.goalMinutes) : null,
      streakDays: live ? run.days : 0,
      studiedToday,
    });
  });

  // Sets this week's goal; later weeks keep it until it is changed again.
  router.put('/', async (req, res) => {
    const { minutes } = goalInput.parse(req.body);
    const week = weekStart(today());
    await inTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO weekly_goals (week_start, goal_minutes) VALUES ($1, $2)
         ON CONFLICT (week_start) DO UPDATE SET goal_minutes = EXCLUDED.goal_minutes, updated_at = now()`,
        [week, minutes],
      );
      await auditChange(req, res, client, 'update', 'weekly_goal', null, {
        weekStart: week,
        minutes,
      });
    });
    res.json({ weekStart: week, goalMinutes: minutes });
  });

  return router;
}
