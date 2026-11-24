import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { auditChange } from './audit-log.js';
import { calendarDate } from './dates.js';
import { feedbackColumns } from './exercise-feedback-routes.js';
import { syncExerciseReview } from './exercise-reviews.js';
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
    // Each attempt carries the feedback Claude gave on it (#363), oldest first.
    const { rows } = await pool.query(
      `SELECT ${columns},
         COALESCE((SELECT json_agg(to_jsonb(f) ORDER BY f.id) FROM (
           SELECT ${feedbackColumns} FROM exercise_attempt_feedback WHERE attempt_id = a.id
         ) f), '[]'::json) AS feedback
       FROM exercise_attempts a WHERE exercise_id = $1
       ORDER BY attempt_date DESC, id DESC`,
      [id],
    );
    res.json({ attempts: rows });
  });

  router.post('/', async (req, res) => {
    const id = parseId((req.params as Record<string, string>).id, 'exercise');
    const input = attemptInput.parse(req.body);
    const date = input.date ?? today();
    try {
      const attempt = await inTransaction(pool, async (client) => {
        const { rows } = await client.query(
          `INSERT INTO exercise_attempts (exercise_id, attempt_date, result, hint_used, note)
           VALUES ($1, $2, $3, $4, $5) RETURNING ${columns}`,
          [id, date, input.result, input.hintUsed, input.note],
        );
        await auditChange(req, res, client, 'create', 'exercise_attempt', rows[0].id, {
          exerciseId: id,
          result: input.result,
        });
        await syncExerciseReview(client, id);
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
      const { rows } = await client.query<{ exerciseId: number }>(
        'DELETE FROM exercise_attempts WHERE id = $1 RETURNING exercise_id AS "exerciseId"',
        [id],
      );
      if (!rows[0]) return false;
      await auditChange(req, res, client, 'delete', 'exercise_attempt', id, {});
      // The review follows the attempts that are left (#393).
      await syncExerciseReview(client, rows[0].exerciseId);
      return true;
    });
    if (!removed) return void res.status(404).json({ error: 'Attempt not found' });
    res.status(204).end();
  });

  return router;
}

// The exercises still counted as wrong (#357): the latest attempt (highest date, then id) is wrong or
// used a hint. A clean correct attempt takes the exercise off the list. Across textbooks, narrowed by
// ?textbookId and ?contentId (a chapter or section; its own exercises only).
const idQuery = (label: string) =>
  z
    .string({ error: `The ${label} format is invalid` })
    .regex(/^[1-9]\d{0,14}$/, `Invalid ${label} ID`)
    .transform(Number)
    .optional();
export const wrongListQuery = z.object({
  textbookId: idQuery('textbook'),
  contentId: idQuery('contents entry'),
});

export function wrongExerciseRoutes(pool: Pool) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { textbookId, contentId } = wrongListQuery.parse(req.query);
    const { rows } = await pool.query(
      `WITH latest AS (
         SELECT DISTINCT ON (exercise_id) exercise_id, attempt_date, result, hint_used
         FROM exercise_attempts ORDER BY exercise_id, attempt_date DESC, id DESC
       )
       SELECT e.id, e.textbook_id AS "textbookId", e.content_id AS "contentId", e.number, e.body,
              e.important, t.title AS "textbookTitle", c.title AS "contentTitle",
              to_char(l.attempt_date, 'YYYY-MM-DD') AS "lastAttemptDate",
              l.result AS "lastResult", l.hint_used AS "hintUsed"
       FROM latest l
       JOIN exercises e ON e.id = l.exercise_id
       JOIN textbooks t ON t.id = e.textbook_id
       JOIN textbook_contents c ON c.id = e.content_id
       WHERE (l.result = 'wrong' OR l.hint_used)
         AND ($1::bigint IS NULL OR e.textbook_id = $1)
         AND ($2::bigint IS NULL OR e.content_id = $2)
       ORDER BY l.attempt_date DESC, e.id DESC`,
      [textbookId ?? null, contentId ?? null],
    );
    res.json({ exercises: rows });
  });

  return router;
}
