import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

import { inTransaction } from './sql.js';

// Days from the previous round's completion (the study date for round 1) to the next round. Done
// on time, the rounds land 1, 3, 7, 14 and 30 days after studying (docs/decisions/review-rules.md).
export const reviewGaps = [1, 2, 4, 7, 16] as const;

// The API accepts study dates up to here, and a later date would not fit YYYY-MM-DD.
const lastDate = '9999-12-31';

// Not stats.addDays: stats imports study-logs, which imports this file.
export function reviewDueDate(baseDate: string, round: number) {
  const date = new Date(`${baseDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + reviewGaps[round - 1]);
  return date.getUTCFullYear() > 9999 ? lastDate : date.toISOString().slice(0, 10);
}

type LogState = { status: string; studyDate: string };

// Keeps round 1 in step with a study log saved in the same transaction. `previous` is the log
// before the save, undefined when it is new. Only a change of status or date acts, so logs that
// were already done before this feature, or a memo edit, create nothing.
export async function syncFirstReview(
  client: PoolClient,
  id: number,
  previous: LogState | undefined,
  log: LogState,
) {
  const wasDone = previous?.status === 'done';
  if (log.status === 'done' && !wasDone) {
    const due = reviewDueDate(log.studyDate, 1);
    // A log whose round 1 was already completed keeps its reviews when it is done again.
    await client.query(
      `INSERT INTO reviews (study_log_id, round, due_date, original_due_date)
       VALUES ($1, 1, $2, $2) ON CONFLICT (study_log_id, round) DO NOTHING`,
      [id, due],
    );
  } else if (log.status !== 'done' && wasDone) {
    await client.query(
      'DELETE FROM reviews WHERE study_log_id = $1 AND round = 1 AND completed_on IS NULL',
      [id],
    );
  } else if (log.status === 'done' && previous?.studyDate !== log.studyDate) {
    // Replaces a snoozed date as well: the old dates belonged to a study date that was wrong.
    const due = reviewDueDate(log.studyDate, 1);
    await client.query(
      `UPDATE reviews SET due_date = $2, original_due_date = $2, updated_at = now()
       WHERE study_log_id = $1 AND round = 1 AND completed_on IS NULL`,
      [id, due],
    );
  }
}

// Same rule as the other ids: plain positive integers that stay exact in JS and fit bigint.
const idParam = z
  .string()
  .regex(/^[1-9]\d{0,14}$/, '복습 ID가 올바르지 않습니다')
  .transform(Number);

const notFound = { error: '복습을 찾을 수 없습니다' };
const alreadyCompleted = { error: '이미 완료한 복습입니다' };

export function reviewRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // Rounds due today and earlier ones not yet completed, which stay until they are; oldest first.
  // `today` comes along so the page counts days overdue from the same date.
  router.get('/today', async (_req, res) => {
    const date = today();
    const { rows } = await pool.query(
      `SELECT r.id, r.round, r.due_date AS "dueDate", l.study_date AS "studyDate", l.memo,
         t.title AS "textbookTitle", c.number AS "contentNumber", c.title AS "contentTitle"
       FROM reviews r
       JOIN study_logs l ON l.id = r.study_log_id
       LEFT JOIN textbooks t ON t.id = l.textbook_id
       LEFT JOIN textbook_contents c ON c.id = l.content_id
       WHERE r.completed_on IS NULL AND r.due_date <= $1
       ORDER BY r.due_date, r.id`,
      [date],
    );
    res.json({ today: date, reviews: rows });
  });

  // Completes a round for good and creates the next one, due from today. The study log is locked
  // first, as saving a log does, so a save and a completion cannot wait on each other.
  router.post('/:id/complete', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const date = today();
    const reply = await inTransaction(pool, async (client) => {
      const found = await client.query<{ studyLogId: number }>(
        'SELECT study_log_id AS "studyLogId" FROM reviews WHERE id = $1',
        [id],
      );
      if (!found.rows[0]) return { status: 404, body: notFound };
      const { studyLogId } = found.rows[0];
      await client.query('SELECT 1 FROM study_logs WHERE id = $1 FOR UPDATE', [studyLogId]);
      const current = await client.query<{ round: number; completed: string | null }>(
        'SELECT round, completed_on AS completed FROM reviews WHERE id = $1',
        [id],
      );
      const review = current.rows[0];
      // Undoing done removes an uncompleted round 1, possibly while this waited for the lock.
      if (!review) return { status: 404, body: notFound };
      if (review.completed) return { status: 409, body: alreadyCompleted };
      await client.query('UPDATE reviews SET completed_on = $2, updated_at = now() WHERE id = $1', [
        id,
        date,
      ]);
      if (review.round === reviewGaps.length)
        return { status: 200, body: { completedOn: date, next: null } };
      const next = { round: review.round + 1, dueDate: reviewDueDate(date, review.round + 1) };
      await client.query(
        `INSERT INTO reviews (study_log_id, round, due_date, original_due_date)
         VALUES ($1, $2, $3, $3)`,
        [studyLogId, next.round, next.dueDate],
      );
      return { status: 200, body: { completedOn: date, next } };
    });
    res.status(reply.status).json(reply.body);
  });

  return router;
}
