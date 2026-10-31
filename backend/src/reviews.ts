import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

import { datePlusDays, isCalendarDate } from './dates.js';
import { inTransaction } from './sql.js';

// Days from the previous round's completion (the study date for round 1) to the next round. Done
// on time, the rounds land 1, 3, 7, 14 and 30 days after studying (docs/decisions/review-rules.md).
export const reviewGaps = [1, 2, 4, 7, 16] as const;

export const reviewDueDate = (baseDate: string, round: number) =>
  datePlusDays(baseDate, reviewGaps[round - 1]);

// The tomorrow-at-the-earliest date a snooze moves a round to, so an overdue round stops being due
// today instead of staying overdue.
export const snoozedDate = (dueDate: string, today: string) =>
  datePlusDays(dueDate > today ? dueDate : today, 1);

// The Saturday ending the week of `day`: weeks start on Sunday (#96).
export const weekEnd = (day: string) =>
  datePlusDays(day, 6 - new Date(`${day}T00:00:00Z`).getUTCDay());

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

const dueDateInput = z.object(
  {
    dueDate: z
      .string({
        required_error: '예정일을 입력하세요',
        invalid_type_error: '예정일 형식이 올바르지 않습니다',
      })
      .regex(/^\d{4}-\d{2}-\d{2}$/, '예정일은 YYYY-MM-DD 형식으로 입력하세요')
      .refine(isCalendarDate, '존재하지 않는 날짜입니다'),
  },
  {
    required_error: '예정일을 JSON 객체로 보내세요',
    invalid_type_error: '예정일을 JSON 객체로 보내세요',
  },
);

const notFound = { error: '복습을 찾을 수 없습니다' };
const alreadyCompleted = { error: '이미 완료한 복습입니다' };

type Reply = { status: number; body: object };

// Runs `change` on an uncompleted round. The study log is locked first, as saving a log does, so a
// save and a change to its reviews cannot wait on each other. A round can be gone once the lock is
// held: undoing done removes an uncompleted round 1.
function changeOpenRound(
  pool: Pool,
  id: number,
  change: (
    client: PoolClient,
    round: { studyLogId: number; round: number; dueDate: string },
  ) => Promise<Reply>,
) {
  return inTransaction(pool, async (client): Promise<Reply> => {
    const found = await client.query<{ studyLogId: number }>(
      'SELECT study_log_id AS "studyLogId" FROM reviews WHERE id = $1',
      [id],
    );
    if (!found.rows[0]) return { status: 404, body: notFound };
    const { studyLogId } = found.rows[0];
    await client.query('SELECT 1 FROM study_logs WHERE id = $1 FOR UPDATE', [studyLogId]);
    const current = await client.query<{
      round: number;
      dueDate: string;
      completed: string | null;
    }>(
      `SELECT round, due_date AS "dueDate", completed_on AS completed FROM reviews WHERE id = $1`,
      [id],
    );
    const review = current.rows[0];
    if (!review) return { status: 404, body: notFound };
    if (review.completed) return { status: 409, body: alreadyCompleted };
    return change(client, { studyLogId, round: review.round, dueDate: review.dueDate });
  });
}

// Moves only this round; original_due_date stays, so a later delay still counts as one (#46).
async function moveRound(client: PoolClient, id: number, dueDate: string): Promise<Reply> {
  await client.query('UPDATE reviews SET due_date = $2, updated_at = now() WHERE id = $1', [
    id,
    dueDate,
  ]);
  return { status: 200, body: { dueDate } };
}

export function reviewRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // Uncompleted rounds up to the date `until` gives (all of them without one), oldest first; overdue
  // ones stay until they are completed. `today` comes along so the page counts days overdue from the
  // same date.
  const listRoute = (path: string, until: (date: string) => string | null) =>
    router.get(path, async (_req, res) => {
      const date = today();
      const { rows } = await pool.query(
        `SELECT r.id, r.round, r.due_date AS "dueDate", l.study_date AS "studyDate", l.memo,
           t.title AS "textbookTitle", c.number AS "contentNumber", c.title AS "contentTitle"
         FROM reviews r
         JOIN study_logs l ON l.id = r.study_log_id
         LEFT JOIN textbooks t ON t.id = l.textbook_id
         LEFT JOIN textbook_contents c ON c.id = l.content_id
         WHERE r.completed_on IS NULL AND ($1::date IS NULL OR r.due_date <= $1::date)
         ORDER BY r.due_date, r.id`,
        [until(date)],
      );
      res.json({ today: date, reviews: rows });
    });
  listRoute('/today', (date) => date);
  listRoute('/week', weekEnd);
  listRoute('/all', () => null);

  // How many rounds the today list has, for the menu badge. Later rounds already created are not
  // due yet, so finishing today's reviews brings this to zero.
  router.get('/today/count', async (_req, res) => {
    const { rows } = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM reviews
       WHERE completed_on IS NULL AND due_date <= $1`,
      [today()],
    );
    res.json({ count: rows[0].count });
  });

  // Completes a round for good and creates the next one, due from today.
  router.post('/:id/complete', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const date = today();
    const reply = await changeOpenRound(pool, id, async (client, review) => {
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
        [review.studyLogId, next.round, next.dueDate],
      );
      return { status: 200, body: { completedOn: date, next } };
    });
    res.status(reply.status).json(reply.body);
  });

  router.post('/:id/snooze', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const date = today();
    const reply = await changeOpenRound(pool, id, (client, review) =>
      moveRound(client, id, snoozedDate(review.dueDate, date)),
    );
    res.status(reply.status).json(reply.body);
  });

  router.put('/:id/due-date', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { dueDate } = dueDateInput.parse(req.body);
    const reply = await changeOpenRound(pool, id, (client) => moveRound(client, id, dueDate));
    res.status(reply.status).json(reply.body);
  });

  return router;
}
