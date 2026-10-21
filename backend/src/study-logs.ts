import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

export const studyStatuses = ['planned', 'in_progress', 'done', 'stopped'] as const;

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// A session that ends earlier than it starts crossed midnight and still belongs to its start date.
export function studyMinutes(startTime: string, endTime: string) {
  const minutes = minutesOf(endTime) - minutesOf(startTime);
  return minutes < 0 ? minutes + 24 * 60 : minutes;
}

const isCalendarDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
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
    },
    {
      required_error: '학습 기록 내용을 JSON 객체로 보내세요',
      invalid_type_error: '학습 기록 내용을 JSON 객체로 보내세요',
    },
  )
  .refine((log) => log.startTime !== log.endTime, {
    message: '종료 시각은 시작 시각과 달라야 합니다',
    path: ['endTime'],
  });

// Only plain positive integers that stay exact in JS and fit the bigint column; "1e3", "0x10"
// or 20-digit ids would otherwise reach Postgres and fail as a 500.
const idParam = z
  .string()
  .regex(/^[1-9]\d{0,14}$/, '학습 기록 ID가 올바르지 않습니다')
  .transform(Number);

const listQuery = z.object({
  date: studyDate.optional(),
  limit: z.coerce
    .number({ invalid_type_error: '조회 개수가 올바르지 않습니다' })
    .int('조회 개수가 올바르지 않습니다')
    .min(1, '조회 개수는 1 이상이어야 합니다')
    .max(100, '조회 개수는 100 이하여야 합니다')
    .default(20),
});

const columns = `id::int AS id, study_date AS "studyDate",
  to_char(start_time, 'HH24:MI') AS "startTime", to_char(end_time, 'HH24:MI') AS "endTime",
  duration_minutes AS "durationMinutes", memo, status`;

const notFound = { error: '학습 기록을 찾을 수 없습니다' };

export function studyLogRoutes(pool: Pool) {
  const router = Router();

  // With ?date the day's entries in time order; otherwise the most recent entries.
  router.get('/', async (req, res) => {
    const { date, limit } = listQuery.parse(req.query);
    const { rows } = date
      ? await pool.query(
          `SELECT ${columns} FROM study_logs WHERE study_date = $1 ORDER BY start_time, id`,
          [date],
        )
      : await pool.query(
          `SELECT ${columns} FROM study_logs ORDER BY study_date DESC, start_time DESC, id DESC LIMIT $1`,
          [limit],
        );
    res.json({ studyLogs: rows });
  });

  router.get('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { rows } = await pool.query(`SELECT ${columns} FROM study_logs WHERE id = $1`, [id]);
    if (rows.length === 0) return void res.status(404).json(notFound);
    res.json({ studyLog: rows[0] });
  });

  router.post('/', async (req, res) => {
    const log = studyLogInput.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO study_logs (study_date, start_time, end_time, duration_minutes, memo, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${columns}`,
      [
        log.studyDate,
        log.startTime,
        log.endTime,
        studyMinutes(log.startTime, log.endTime),
        log.memo,
        log.status,
      ],
    );
    res.status(201).json({ studyLog: rows[0] });
  });

  router.put('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const log = studyLogInput.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE study_logs SET study_date = $2, start_time = $3, end_time = $4, duration_minutes = $5,
         memo = $6, status = $7, updated_at = now()
       WHERE id = $1 RETURNING ${columns}`,
      [
        id,
        log.studyDate,
        log.startTime,
        log.endTime,
        studyMinutes(log.startTime, log.endTime),
        log.memo,
        log.status,
      ],
    );
    if (rows.length === 0) return void res.status(404).json(notFound);
    res.json({ studyLog: rows[0] });
  });

  router.delete('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { rowCount } = await pool.query('DELETE FROM study_logs WHERE id = $1', [id]);
    if (!rowCount) return void res.status(404).json(notFound);
    res.status(204).end();
  });

  return router;
}
