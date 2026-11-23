import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { auditChange } from './audit-log.js';
import { calendarDate } from './dates.js';
import { inTransaction } from './sql.js';
import { parseId } from './standard/http.js';
import { missingOrInvalid } from './validation.js';

// Recording how each try at an exercise went (#356): /api/exercises/:id/attempts and
// /api/exercise-attempts/:id.
export const attemptInput = z.object({
  result: z.enum(['correct', 'wrong'], {
    error: (issue) =>
      issue.input === undefined
        ? 'Choose whether the answer was correct or wrong'
        : 'The result must be correct or wrong',
  }),
  hintUsed: z.boolean({ error: 'The hint flag format is invalid' }).default(false),
  // Defaults to today when left out.
  date: calendarDate(
    z.string(missingOrInvalid('Enter the attempt date', 'The attempt date format is invalid')),
    'The attempt date must be in YYYY-MM-DD format',
  ).optional(),
  note: z
    .string({ error: 'The note format is invalid' })
    .trim()
    .max(2000, 'The note must be at most 2000 characters')
    .default(''),
});

const columns = `id, exercise_id AS "exerciseId", to_char(attempt_date, 'YYYY-MM-DD') AS date,
  result, hint_used AS "hintUsed", note,
  to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') AS "createdAt"`;

const notFound = { error: 'Exercise not found' };

export function exerciseAttemptRoutes(pool: Pool, today: () => string) {
  const router = Router({ mergeParams: true });

  // Newest first, so the history reads from the latest try.
  router.get('/', async (req, res) => {
    const id = parseId((req.params as Record<string, string>).id, 'exercise');
    const exercise = await pool.query('SELECT 1 FROM exercises WHERE id = $1', [id]);
    if (!exercise.rowCount) return void res.status(404).json(notFound);
    const { rows } = await pool.query(
      `SELECT ${columns} FROM exercise_attempts WHERE exercise_id = $1
       ORDER BY attempt_date DESC, id DESC`,
      [id],
    );
    res.json({ attempts: rows });
  });

  router.post('/', async (req, res) => {
    const id = parseId((req.params as Record<string, string>).id, 'exercise');
    const input = attemptInput.parse(req.body);
    try {
      const attempt = await inTransaction(pool, async (client) => {
        const { rows } = await client.query(
          `INSERT INTO exercise_attempts (exercise_id, attempt_date, result, hint_used, note)
           VALUES ($1, $2, $3, $4, $5) RETURNING ${columns}`,
          [id, input.date ?? today(), input.result, input.hintUsed, input.note],
        );
        await auditChange(req, res, client, 'create', 'exercise_attempt', rows[0].id, {
          exerciseId: id,
          result: input.result,
        });
        return rows[0];
      });
      res.status(201).json({ attempt });
    } catch (error) {
      // The exercise does not exist.
      if ((error as { code?: string }).code !== '23503') throw error;
      res.status(404).json(notFound);
    }
  });

  return router;
}

export function attemptRoutes(pool: Pool) {
  const router = Router();

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'attempt');
    const removed = await inTransaction(pool, async (client) => {
      const { rowCount } = await client.query('DELETE FROM exercise_attempts WHERE id = $1', [id]);
      if (rowCount) await auditChange(req, res, client, 'delete', 'exercise_attempt', id, {});
      return Boolean(rowCount);
    });
    if (!removed) return void res.status(404).json({ error: 'Attempt not found' });
    res.status(204).end();
  });

  return router;
}
