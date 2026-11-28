import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { auditChange } from './audit-log.js';
import { monthRange } from './calendar.js';
import { claudeSlots } from './claude-call.js';
import { calendarDate } from './dates.js';
import { type Drafter, DraftError } from './retrospective-draft.js';
import { inTransaction } from './sql.js';
import { requestIdOf } from './standard/http.js';
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

export const bodyInput = z.object(
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

export const periodQuery = z.object({ kind: kind.default('weekly'), date: day.optional() });

export const listQuery = z.object({
  kind: kind.optional(),
  limit: z.coerce
    .number({ error: 'The limit is invalid' })
    .int('The limit is invalid')
    .min(1, 'The limit must be at least 1')
    .max(100, 'The limit must be at most 100')
    .default(20),
});

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
export function retrospectiveRoutes(pool: Pool, today: () => string, drafter: Drafter) {
  const router = Router();
  // The periods being drafted now: a repeated request for the same one is refused, not paid twice.
  const drafting = new Set<string>();

  // The period holding ?date (today by default), its retrospective if written, and a summary of
  // its study logs (planned ones do not count as studied, as in the stats).
  router.get('/period', async (req, res) => {
    const query = periodQuery.parse(req.query);
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
           count(*) FILTER (WHERE status <> 'planned' AND goal_achieved)::int AS "goalsAchieved",
           count(*) FILTER (WHERE status <> 'planned' AND goal_achieved IS NOT NULL)::int AS "goalsChecked"
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
    const query = listQuery.parse(req.query);
    const { rows } = await pool.query(
      `SELECT ${columns} FROM retrospectives
       WHERE $1::text IS NULL OR kind = $1 ORDER BY period_start DESC, kind LIMIT $2`,
      [query.kind ?? null, query.limit],
    );
    res.json({ retrospectives: rows });
  });

  // A draft for the period from its study logs and difficult parts (#362). Nothing is
  // saved: the person edits the draft and saves it with the normal save.
  router.post('/:kind/:start/draft', async (req, res) => {
    // Only a JSON request, which another site's page cannot send without a CORS preflight this server
    // never allows: a draft costs money, so a form or a no-cors fetch must not start one.
    if (!req.is('application/json'))
      return void res.status(415).json({ error: 'Send the draft request as JSON' });
    const period = periodPath(req.params);
    const key = `${period.kind}:${period.from}`;
    const logs = await pool.query(
      `SELECT to_char(l.study_date, 'YYYY-MM-DD') AS date, l.duration_minutes AS minutes,
         l.study_type AS "studyType", t.title AS textbook, l.memo, l.difficulties, l.understanding,
         l.goal_achieved AS "goalAchieved"
       FROM study_logs l LEFT JOIN textbooks t ON t.id = l.textbook_id
       WHERE l.status <> 'planned' AND l.study_date BETWEEN $1 AND $2
       ORDER BY l.study_date, l.start_time LIMIT 200`,
      [period.from, period.to],
    );
    if (logs.rows.length === 0)
      return void res
        .status(400)
        .json({ error: 'There are no study logs in this period to write a draft from' });
    if (drafting.has(key))
      return void res
        .status(409)
        .json({ error: 'A draft for this period is already being written' });
    if (!claudeSlots.enter()) {
      res.set('retry-after', '5');
      return void res
        .status(503)
        .json({ error: 'Too many files are being read or translated. Try again shortly' });
    }
    drafting.add(key);
    // A request the person gave up on (tab closed) stops the paid call too.
    const stop = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) stop.abort();
    });
    try {
      const drafted = await drafter({
        kind: period.kind,
        from: period.from,
        to: period.to,
        logs: logs.rows,
        signal: stop.signal,
        requestId: requestIdOf(res),
      });
      if (stop.signal.aborted) return;
      res.json({ draft: drafted.body, model: drafted.model });
    } catch (error) {
      if (stop.signal.aborted) return;
      if (!(error instanceof DraftError)) throw error;
      res.status(error.status).json({ error: error.message });
    } finally {
      claudeSlots.leave();
      drafting.delete(key);
    }
  });

  // Writes the period's retrospective, replacing the one already there (one per period).
  router.put('/:kind/:start', async (req, res) => {
    const period = periodPath(req.params);
    const { body } = bodyInput.parse(req.body);
    const { created: _created, ...retrospective } = await inTransaction(pool, async (client) => {
      // xmax is 0 only on a row this statement inserted, so a replaced one is told from a new one.
      const { rows } = await client.query(
        `INSERT INTO retrospectives (kind, period_start, period_end, body) VALUES ($1, $2, $3, $4)
         ON CONFLICT (kind, period_start)
         DO UPDATE SET body = EXCLUDED.body, updated_at = now()
         RETURNING ${columns}, (xmax = 0) AS created`,
        [period.kind, period.from, period.to, body],
      );
      await auditChange(
        req,
        res,
        client,
        rows[0].created ? 'create' : 'update',
        'retrospective',
        rows[0].id,
        {
          kind: period.kind,
          from: period.from,
        },
      );
      return rows[0];
    });
    res.json({ retrospective });
  });

  router.delete('/:kind/:start', async (req, res) => {
    const period = periodPath(req.params);
    const deleted = await inTransaction(pool, async (client) => {
      const removed = await client.query(
        'DELETE FROM retrospectives WHERE kind = $1 AND period_start = $2 RETURNING id',
        [period.kind, period.from],
      );
      if (removed.rows[0])
        await auditChange(req, res, client, 'delete', 'retrospective', removed.rows[0].id, {
          kind: period.kind,
          from: period.from,
        });
      return removed.rowCount;
    });
    if (!deleted) return void res.status(404).json(notFound);
    res.status(204).end();
  });

  return router;
}
