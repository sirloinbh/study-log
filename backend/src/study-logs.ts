import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

import { syncFirstReview } from './reviews.js';
import { inTransaction, likePattern } from './sql.js';

export const studyStatuses = ['planned', 'in_progress', 'done', 'stopped'] as const;

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// A session that ends earlier than it starts crossed midnight and still belongs to its start date.
export function studyMinutes(startTime: string, endTime: string) {
  const minutes = minutesOf(endTime) - minutesOf(startTime);
  return minutes < 0 ? minutes + 24 * 60 : minutes;
}

// Year 0000 is a valid JS date but not a PostgreSQL one, so it is refused here as well.
export const isCalendarDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    value >= '0001-01-01' &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
};

const studyDate = z
  .string({
    required_error: '학습일을 입력하세요',
    invalid_type_error: '학습일 형식이 올바르지 않습니다',
  })
  .regex(/^\d{4}-\d{2}-\d{2}$/, '학습일은 YYYY-MM-DD 형식으로 입력하세요')
  .refine(isCalendarDate, '존재하지 않는 날짜입니다');

const clock = (label: string) =>
  z
    .string({
      required_error: `${label}을 입력하세요`,
      invalid_type_error: `${label} 형식이 올바르지 않습니다`,
    })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label}은 HH:MM 형식으로 입력하세요`);

// Optional reference ids in the body: a positive integer within the id limit, or null.
const referenceId = (label: string) => {
  const message = `${label} ID가 올바르지 않습니다`;
  return z
    .number({ invalid_type_error: message })
    .int(message)
    .min(1, message)
    .max(999_999_999_999_999, message)
    .nullable()
    .default(null);
};

const studyLogInput = z
  .object(
    {
      studyDate,
      startTime: clock('시작 시각'),
      endTime: clock('종료 시각'),
      memo: z
        .string({ invalid_type_error: '메모 형식이 올바르지 않습니다' })
        .max(10000, '메모는 10000자 이하로 입력하세요')
        .default(''),
      status: z
        .enum(studyStatuses, {
          errorMap: () => ({ message: '상태는 계획, 진행 중, 완료, 중단 중에서 선택하세요' }),
        })
        .default('planned'),
      textbookId: referenceId('교재'),
      contentId: referenceId('목차'),
      understanding: z
        .number({ invalid_type_error: '이해도는 1~5 사이 정수로 입력하세요' })
        .int('이해도는 1~5 사이 정수로 입력하세요')
        .min(1, '이해도는 1~5 사이 정수로 입력하세요')
        .max(5, '이해도는 1~5 사이 정수로 입력하세요')
        .nullable()
        .default(null),
      difficulties: z
        .string({ invalid_type_error: '어려웠던 부분 형식이 올바르지 않습니다' })
        .max(2000, '어려웠던 부분은 2000자 이하로 입력하세요')
        .default(''),
      goalAchieved: z
        .boolean({ invalid_type_error: '목표 달성 여부 형식이 올바르지 않습니다' })
        .nullable()
        .default(null),
    },
    {
      required_error: '학습 기록 내용을 JSON 객체로 보내세요',
      invalid_type_error: '학습 기록 내용을 JSON 객체로 보내세요',
    },
  )
  .refine((log) => log.startTime !== log.endTime, {
    message: '종료 시각은 시작 시각과 달라야 합니다',
    path: ['endTime'],
  })
  .refine((log) => log.contentId === null || log.textbookId !== null, {
    message: '목차를 고르려면 교재를 먼저 선택하세요',
    path: ['contentId'],
  });

// Only plain positive integers that stay exact in JS and fit the bigint column; "1e3", "0x10"
// or 20-digit ids would otherwise reach Postgres and fail as a 500.
const idParam = z
  .string()
  .regex(/^[1-9]\d{0,14}$/, '학습 기록 ID가 올바르지 않습니다')
  .transform(Number);

// ?date for one day in time order; otherwise the most recent logs, narrowed by ?textbookId, ?q
// (memo or difficulties, any case) and ?from/?to (#18). Every given condition applies.
const listQuery = z
  .object({
    date: studyDate.optional(),
    q: z
      .string({ invalid_type_error: '검색어 형식이 올바르지 않습니다' })
      .trim()
      .max(50, '검색어는 50자 이하로 입력하세요')
      .optional(),
    from: studyDate.optional(),
    to: studyDate.optional(),
    textbookId: z
      .string()
      .regex(/^[1-9]\d{0,14}$/, '교재 ID가 올바르지 않습니다')
      .transform(Number)
      .optional(),
    limit: z.coerce
      .number({ invalid_type_error: '조회 개수가 올바르지 않습니다' })
      .int('조회 개수가 올바르지 않습니다')
      .min(1, '조회 개수는 1 이상이어야 합니다')
      .max(100, '조회 개수는 100 이하여야 합니다')
      .default(20),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: '시작일은 종료일보다 늦을 수 없습니다',
  });

// `source` is study_logs or a CTE of written rows; the textbook and chapter names come along so
// the list can show them without more requests.
const select = (source: string) => `SELECT l.id, l.study_date AS "studyDate",
  to_char(l.start_time, 'HH24:MI') AS "startTime", to_char(l.end_time, 'HH24:MI') AS "endTime",
  l.duration_minutes AS "durationMinutes", l.memo, l.status,
  l.textbook_id AS "textbookId", t.title AS "textbookTitle",
  l.content_id AS "contentId", c.number AS "contentNumber", c.title AS "contentTitle",
  l.understanding, l.difficulties, l.goal_achieved AS "goalAchieved"
  FROM ${source} l
  LEFT JOIN textbooks t ON t.id = l.textbook_id
  LEFT JOIN textbook_contents c ON c.id = l.content_id`;

const notFound = { error: '학습 기록을 찾을 수 없습니다' };

// A reference that does not exist (or a chapter of another textbook) fails its foreign key.
const missingReference: Record<string, string> = {
  study_logs_textbook_fkey: '교재를 찾을 수 없습니다',
  study_logs_content_fkey: '목차를 찾을 수 없습니다',
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
    const { date, limit, textbookId, q, from, to } = listQuery.parse(req.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (date) where.push(`l.study_date = $${params.push(date)}`);
    if (textbookId !== undefined) where.push(`l.textbook_id = $${params.push(textbookId)}`);
    if (q) {
      const pattern = `$${params.push(likePattern(q))}`;
      where.push(`(l.memo ILIKE ${pattern} OR l.difficulties ILIKE ${pattern})`);
    }
    if (from) where.push(`l.study_date >= $${params.push(from)}`);
    if (to) where.push(`l.study_date <= $${params.push(to)}`);
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = date
      ? await pool.query(`${select('study_logs')} ${filter} ORDER BY l.start_time, l.id`, params)
      : await pool.query(
          `${select('study_logs')} ${filter}
           ORDER BY l.study_date DESC, l.start_time DESC, l.id DESC LIMIT $${params.push(limit)}`,
          params,
        );
    res.json({ studyLogs: rows });
  });

  router.get('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
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
               status, textbook_id, content_id, understanding, difficulties, goal_achieved)
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
            log.difficulties,
            log.goalAchieved,
          ],
        );
        await syncFirstReview(client, rows[0].id, undefined, log);
        return rows[0];
      }),
    );
    if (!result.ok) return void res.status(400).json({ error: result.error });
    res.status(201).json({ studyLog: result.value });
  });

  router.put('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
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
               understanding = $10, difficulties = $11, goal_achieved = $12,
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
            log.difficulties,
            log.goalAchieved,
          ],
        );
        await syncFirstReview(client, id, previous, log);
        return rows[0];
      }),
    );
    if (!result.ok) return void res.status(400).json({ error: result.error });
    if (!result.value) return void res.status(404).json(notFound);
    res.json({ studyLog: result.value });
  });

  router.delete('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { rowCount } = await pool.query('DELETE FROM study_logs WHERE id = $1', [id]);
    if (!rowCount) return void res.status(404).json(notFound);
    res.status(204).end();
  });

  return router;
}
