import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { auditChange } from './audit-log.js';
import { calendarDate } from './dates.js';
import { syncFirstReview } from './reviews.js';
import { inTransaction, likePattern } from './sql.js';
import { parseId } from './standard/http.js';
import { missingOrInvalid } from './validation.js';

export const studyStatuses = ['planned', 'in_progress', 'done', 'stopped'] as const;
export const studyTypes = ['new', 'review'] as const;

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// A session that ends earlier than it starts crossed midnight and still belongs to its start date.
export function studyMinutes(startTime: string, endTime: string) {
  const minutes = minutesOf(endTime) - minutesOf(startTime);
  return minutes < 0 ? minutes + 24 * 60 : minutes;
}

const studyDate = calendarDate(
  z.string(missingOrInvalid('Enter the study date', 'The study date format is invalid')),
  'The study date must be in YYYY-MM-DD format',
);

const clock = (label: string) =>
  z
    .string(missingOrInvalid(`Enter the ${label}`, `The ${label} format is invalid`))
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `The ${label} must be in HH:MM format`);

// Optional reference ids in the body: a positive integer within the id limit, or null.
const referenceId = (label: string) => {
  const message = `Invalid ${label} ID`;
  return z
    .number({ error: message })
    .int(message)
    .min(1, message)
    .max(999_999_999_999_999, message)
    .nullable()
    .default(null);
};

export const studyLogInput = z
  .object(
    {
      studyDate,
      startTime: clock('start time'),
      endTime: clock('end time'),
      memo: z
        .string({ error: 'The memo format is invalid' })
        .refine((value) => value.length <= 50000, 'The memo must be at most 50000 characters')
        .default(''),
      status: z
        .enum(studyStatuses, { error: 'The status must be planned, in progress, done, or stopped' })
        .default('planned'),
      textbookId: referenceId('textbook'),
      contentId: referenceId('contents entry'),
      understanding: z
        .number({ error: 'Understanding must be a whole number from 1 to 5' })
        .int('Understanding must be a whole number from 1 to 5')
        .min(1, 'Understanding must be a whole number from 1 to 5')
        .max(5, 'Understanding must be a whole number from 1 to 5')
        .nullable()
        .default(null),
      goalAchieved: z
        .boolean({ error: 'The goal-achieved flag format is invalid' })
        .nullable()
        .default(null),
      studyType: z
        .enum(studyTypes, { error: 'The study type must be new or review' })
        .default('new'),
    },
    { error: 'Send the study log as a JSON object' },
  )
  .refine((log) => log.startTime !== log.endTime, {
    error: 'The end time must differ from the start time',
    path: ['endTime'],
  })
  .refine((log) => log.contentId === null || log.textbookId !== null, {
    error: 'Choose a textbook before choosing a contents entry',
    path: ['contentId'],
  });

// ?date for one day in time order; otherwise the most recent logs, narrowed by ?textbookId, ?q
// (memo, any case) and ?from/?to (#18). Every given condition applies.
export const studyLogListQuery = z
  .object({
    date: studyDate.optional(),
    q: z
      .string({ error: 'The search term format is invalid' })
      .trim()
      .refine((value) => value.length <= 50, 'The search term must be at most 50 characters')
      .optional(),
    from: studyDate.optional(),
    to: studyDate.optional(),
    textbookId: z
      .string({ error: 'Invalid textbook ID' })
      .regex(/^[1-9]\d{0,14}$/, 'Invalid textbook ID')
      .transform(Number)
      .optional(),
    limit: z.coerce
      .number({ error: 'The limit is invalid' })
      .int('The limit is invalid')
      .min(1, 'The limit must be at least 1')
      .max(100, 'The limit must be at most 100')
      .default(20),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    error: 'The start date cannot be after the end date',
  });

// `source` is study_logs or a CTE of written rows; the textbook and chapter names come along so
// the list can show them without more requests.
const select = (source: string) => `SELECT l.id, l.study_date AS "studyDate",
  to_char(l.start_time, 'HH24:MI') AS "startTime", to_char(l.end_time, 'HH24:MI') AS "endTime",
  l.duration_minutes AS "durationMinutes", l.memo, l.status,
  l.textbook_id AS "textbookId", t.title AS "textbookTitle",
  l.content_id AS "contentId", c.number AS "contentNumber", c.title AS "contentTitle",
  l.understanding, l.goal_achieved AS "goalAchieved",
  l.study_type AS "studyType"
  FROM ${source} l
  LEFT JOIN textbooks t ON t.id = l.textbook_id
  LEFT JOIN textbook_contents c ON c.id = l.content_id`;

const notFound = { error: 'Study log not found' };

export type Db = Pick<Pool, 'query'>;
export type StudyLogListQuery = z.output<typeof studyLogListQuery>;

/** The list of GET /api/study-logs, also read by the AI tool. */
export async function listStudyLogs(db: Db, query: StudyLogListQuery) {
  const { date, limit, textbookId, q, from, to } = query;
  const params: unknown[] = [];
  const where: string[] = [];
  // A placeholder is "$" and the parameter number: the template literal below writes that as "$" plus an expression.
  const ph = (value: unknown) => '$' + params.push(value);
  if (date) where.push(`l.study_date = ${ph(date)}`);
  if (textbookId !== undefined) where.push(`l.textbook_id = ${ph(textbookId)}`);
  if (q) {
    const pattern = ph(likePattern(q));
    where.push(`l.memo ILIKE ${pattern}`);
  }
  if (from) where.push(`l.study_date >= ${ph(from)}`);
  if (to) where.push(`l.study_date <= ${ph(to)}`);
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = date
    ? await db.query(`${select('study_logs')} ${filter} ORDER BY l.start_time, l.id`, params)
    : await db.query(
        `${select('study_logs')} ${filter}
           ORDER BY l.study_date DESC, l.start_time DESC, l.id DESC LIMIT ${ph(limit)}`,
        params,
      );
  return rows;
}

// A reference that does not exist (or a chapter of another textbook) fails its foreign key.
const missingReference: Record<string, string> = {
  study_logs_textbook_fkey: 'Textbook not found',
  study_logs_content_fkey: 'Contents entry not found',
};

async function write<T>(run: () => Promise<T>) {
  try {
    return { ok: true as const, value: await run() };
  } catch (error) {
    const { code, constraint } = error as { code?: string; constraint?: string };
    const message = code === '23503' && constraint ? missingReference[constraint] : undefined;
    if (!message) throw error;
    return { ok: false as const, error: message };
  }
}

export function studyLogRoutes(pool: Pool) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json({ studyLogs: await listStudyLogs(pool, studyLogListQuery.parse(req.query)) });
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'study log');
    const { rows } = await pool.query(`${select('study_logs')} WHERE l.id = $1`, [id]);
    if (rows.length === 0) return void res.status(404).json(notFound);
    res.json({ studyLog: rows[0] });
  });

  router.post('/', async (req, res) => {
    const log = studyLogInput.parse(req.body);
    const result = await write(() =>
      inTransaction(pool, async (client) => {
        const { rows } = await client.query<{ id: number }>(
          `WITH saved AS (
             INSERT INTO study_logs (study_date, start_time, end_time, duration_minutes, memo,
               status, textbook_id, content_id, understanding, goal_achieved, study_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *)
           ${select('saved')}`,
          [
            log.studyDate,
            log.startTime,
            log.endTime,
            studyMinutes(log.startTime, log.endTime),
            log.memo,
            log.status,
            log.textbookId,
            log.contentId,
            log.understanding,
            log.goalAchieved,
            log.studyType,
          ],
        );
        await syncFirstReview(client, rows[0].id, undefined, log);
        await auditChange(req, res, client, 'create', 'study_log', rows[0].id, {
          studyDate: log.studyDate,
          status: log.status,
          textbookId: log.textbookId,
        });
        return rows[0];
      }),
    );
    if (!result.ok) return void res.status(400).json({ error: result.error });
    res.status(201).json({ studyLog: result.value });
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'study log');
    const log = studyLogInput.parse(req.body);
    const result = await write(() =>
      inTransaction(pool, async (client) => {
        // The lock keeps two saves of one log from both acting on the same earlier status.
        const before = await client.query<{ status: string; studyDate: string }>(
          'SELECT status, study_date AS "studyDate" FROM study_logs WHERE id = $1 FOR UPDATE',
          [id],
        );
        const previous = before.rows[0];
        if (!previous) return undefined;
        const { rows } = await client.query(
          `WITH saved AS (
             UPDATE study_logs SET study_date = $2, start_time = $3, end_time = $4,
               duration_minutes = $5, memo = $6, status = $7, textbook_id = $8, content_id = $9,
               understanding = $10, goal_achieved = $11, study_type = $12,
               updated_at = now()
             WHERE id = $1 RETURNING *)
           ${select('saved')}`,
          [
            id,
            log.studyDate,
            log.startTime,
            log.endTime,
            studyMinutes(log.startTime, log.endTime),
            log.memo,
            log.status,
            log.textbookId,
            log.contentId,
            log.understanding,
            log.goalAchieved,
            log.studyType,
          ],
        );
        await syncFirstReview(client, id, previous, log);
        await auditChange(req, res, client, 'update', 'study_log', id, {
          studyDate: log.studyDate,
          status: log.status,
          textbookId: log.textbookId,
        });
        return rows[0];
      }),
    );
    if (!result.ok) return void res.status(400).json({ error: result.error });
    if (!result.value) return void res.status(404).json(notFound);
    res.json({ studyLog: result.value });
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'study log');
    const deleted = await inTransaction(pool, async (client) => {
      const removed = await client.query(
        'DELETE FROM study_logs WHERE id = $1 RETURNING study_date AS "studyDate", status',
        [id],
      );
      if (removed.rows[0])
        await auditChange(req, res, client, 'delete', 'study_log', id, removed.rows[0]);
      return removed.rowCount;
    });
    if (!deleted) return void res.status(404).json(notFound);
    res.status(204).end();
  });

  return router;
}
