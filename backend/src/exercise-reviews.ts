import type { Pool, PoolClient } from 'pg';

import { datePlusDays } from './dates.js';

// Reviews of exercises I got wrong (#358, docs/decisions/review-rules.md chapter 7). After a wrong or
// hinted attempt the exercise is due in 1, 3, 7, then 14 days from the attempt. A clean correct
// attempt moves it to the next step, finishing step 4 ends the cycle, and a wrong or hinted attempt
// restarts it at step 1.
export const exerciseReviewGaps = [1, 3, 7, 14] as const;

export type ExerciseReviewState = { step: number } | undefined;
export type ExerciseReviewChange =
  { action: 'set'; step: number; dueDate: string } | { action: 'end' } | { action: 'none' };

// What an attempt does to the exercise's review, given the review it has now (if any).
export function nextExerciseReview(
  current: ExerciseReviewState,
  attempt: { date: string; result: 'correct' | 'wrong'; hintUsed: boolean },
): ExerciseReviewChange {
  const clean = attempt.result === 'correct' && !attempt.hintUsed;
  if (!clean) return { action: 'set', step: 1, dueDate: datePlusDays(attempt.date, 1) };
  if (!current) return { action: 'none' };
  if (current.step >= exerciseReviewGaps.length) return { action: 'end' };
  const step = current.step + 1;
  return { action: 'set', step, dueDate: datePlusDays(attempt.date, exerciseReviewGaps[step - 1]) };
}

// Applies an attempt to the review, in the transaction that saved the attempt.
export async function syncExerciseReview(
  client: PoolClient,
  exerciseId: number,
  attempt: { date: string; result: 'correct' | 'wrong'; hintUsed: boolean },
) {
  const { rows } = await client.query<{ step: number }>(
    'SELECT step FROM exercise_reviews WHERE exercise_id = $1 FOR UPDATE',
    [exerciseId],
  );
  const change = nextExerciseReview(rows[0], attempt);
  if (change.action === 'set')
    await client.query(
      `INSERT INTO exercise_reviews (exercise_id, step, due_date) VALUES ($1, $2, $3)
       ON CONFLICT (exercise_id) DO UPDATE
         SET step = EXCLUDED.step, due_date = EXCLUDED.due_date, updated_at = now()`,
      [exerciseId, change.step, change.dueDate],
    );
  else if (change.action === 'end')
    await client.query('DELETE FROM exercise_reviews WHERE exercise_id = $1', [exerciseId]);
}

// The exercise reviews due up to `until` (all without one), oldest first, with where the exercise is.
export async function listExerciseReviews(pool: Pick<Pool, 'query'>, until: string | null) {
  const { rows } = await pool.query(
    `SELECT e.id AS "exerciseId", r.step, to_char(r.due_date, 'YYYY-MM-DD') AS "dueDate",
       e.number, e.body, t.title AS "textbookTitle", c.title AS "contentTitle"
     FROM exercise_reviews r
     JOIN exercises e ON e.id = r.exercise_id
     JOIN textbooks t ON t.id = e.textbook_id
     JOIN textbook_contents c ON c.id = e.content_id
     WHERE ($1::date IS NULL OR r.due_date <= $1::date)
     ORDER BY r.due_date, e.id`,
    [until],
  );
  return rows;
}

export async function countExerciseReviews(pool: Pick<Pool, 'query'>, today: string) {
  const { rows } = await pool.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM exercise_reviews WHERE due_date <= $1',
    [today],
  );
  return rows[0].count;
}
