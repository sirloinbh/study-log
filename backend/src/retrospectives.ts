import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { monthRange } from './calendar.js';
import { calendarDate } from './dates.js';
import { addDays, weekStart } from './stats.js';
import { missingOrInvalid } from './validation.js';

export const retrospectiveKinds = ['weekly', 'monthly'] as const;
export type RetrospectiveKind = (typeof retrospectiveKinds)[number];

const kind = z.enum(retrospectiveKinds, {
  error: 'The retrospective kind must be weekly or monthly',
});

// Years 1900 to 9998 only: a week around 0001-01-01 or 9999-12-31 would run into a year the
// database cannot store and fail as a 500.
const day = calendarDate(
  z.string({ error: 'The date format is invalid' }),
  'The date must be in YYYY-MM-DD format',
).refine(
  (value) => value >= '1900-01-01' && value <= '9998-12-31',
  'The retrospective date must be between 1900 and 9998',
);

const bodyInput = z.object(
  {
    body: z
      .string(
        missingOrInvalid(
          'Enter the retrospective text',
          'The retrospective text format is invalid',
        ),
      )
      .refine((body) => body.trim().length > 0, 'Enter the retrospective text')
      .refine(
        (body) => body.length <= 20000,
        'The retrospective text must be at most 20000 characters',
      ),
  },
  { error: 'Send the retrospective as a JSON object' },
);

// The week (Sunday to Saturday, #96) or month that holds `date`.
export function periodOf(kind: RetrospectiveKind, date: string) {
  if (kind === 'weekly') {
    const from = weekStart(date);
    return { from, to: addDays(from, 6) };
  }
  return monthRange(date.slice(0, 7));
}

// A path's period start must open its period: a Sunday for a week, the 1st for a month.
const periodPath = (params: Record<string, string>) => {
  const parsed = z.object({ kind, start: day }).parse(params);
  const period = periodOf(parsed.kind, parsed.start);
  if (period.from !== parsed.start)
    throw new z.ZodError([
      {
        code: 'custom',
        input: parsed.start,
        path: ['start'],
        message:
          parsed.kind === 'weekly'
            ? 'A weekly retrospective starts on a Sunday'
            : 'A monthly retrospective starts on the 1st',
      },
    ]);
  return { kind: parsed.kind, ...period };
};

const columns = `id, kind, period_start AS "from", period_end AS "to", body,
  to_char(updated_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') AS "updatedAt"`;

const notFound = { error: 'Retrospective not found' };

// Retrospectives (#19): /api/retrospectives
export function retrospectiveRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // The period holding ?date (today by default), its retrospective if written, and a summary of
  // its study logs (planned ones do not count as studied, as in the stats).
  router.get('/period', async (req, res) => {
    const query = z.object({ kind: kind.default('weekly'), date: day.optional() }).parse(req.query);
    const { from, to } = periodOf(query.kind, query.date ?? today());
    const [written, summary] = await Promise.all([
      pool.query(`SELECT ${columns} FROM retrospectives WHERE kind = $1 AND period_start = $2`, [
        query.kind,
        from,
      ]),
      pool.query(
        `SELECT COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'planned'), 0)::int AS "totalMinutes",
           count(DISTINCT study_date) FILTER (WHERE status <> 'planned')::int AS "studyDays",
           count(*) FILTER (WHERE status <> 'planned')::int AS "logs",
           count(*) FILTER (WHERE goal_achieved)::int AS "goalsAchieved",
           count(*) FILTER (WHERE goal_achieved IS NOT NULL)::int AS "goalsChecked"
         FROM study_logs WHERE study_date BETWEEN $1 AND $2`,
        [from, to],
      ),
    ]);
    res.json({
      kind: query.kind,
      from,
      to,
      retrospective: written.rows[0] ?? null,
      summary: summary.rows[0],
    });
  });

  // The latest retrospectives of a kind, newest period first.
  router.get('/', async (req, res) => {
    const query = z
      .object({
        kind: kind.optional(),
        limit: z.coerce
          .number({ error: 'The limit is invalid' })
          .int('The limit is invalid')
          .min(1, 'The limit must be at least 1')
          .max(100, 'The limit must be at most 100')
          .default(20),
      })
      .parse(req.query);
    const { rows } = await pool.query(
      `SELECT ${columns} FROM retrospectives
       WHERE $1::text IS NULL OR kind = $1 ORDER BY period_start DESC, kind LIMIT $2`,
      [query.kind ?? null, query.limit],
    );
    res.json({ retrospectives: rows });
  });

  // Writes the period's retrospective, replacing the one already there (one per period).
  router.put('/:kind/:start', async (req, res) => {
    const period = periodPath(req.params);
    const { body } = bodyInput.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO retrospectives (kind, period_start, period_end, body) VALUES ($1, $2, $3, $4)
       ON CONFLICT (kind, period_start)
       DO UPDATE SET body = EXCLUDED.body, updated_at = now()
       RETURNING ${columns}`,
      [period.kind, period.from, period.to, body],
    );
    res.json({ retrospective: rows[0] });
  });

  router.delete('/:kind/:start', async (req, res) => {
    const period = periodPath(req.params);
    const { rowCount } = await pool.query(
      'DELETE FROM retrospectives WHERE kind = $1 AND period_start = $2',
      [period.kind, period.from],
    );
    if (!rowCount) return void res.status(404).json(notFound);
    res.status(204).end();
  });

  return router;
}
