import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { monthRange } from './calendar.js';
import { addDays, weekStart } from './stats.js';
import { isCalendarDate } from './study-logs.js';

export const retrospectiveKinds = ['weekly', 'monthly'] as const;
export type RetrospectiveKind = (typeof retrospectiveKinds)[number];

const kind = z.enum(retrospectiveKinds, {
  errorMap: () => ({ message: '회고 종류는 주간 또는 월간이어야 합니다' }),
});

const day = z
  .string({ invalid_type_error: '날짜 형식이 올바르지 않습니다' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜는 YYYY-MM-DD 형식으로 입력하세요')
  .refine(isCalendarDate, '존재하지 않는 날짜입니다');

const bodyInput = z.object(
  {
    body: z
      .string({
        required_error: '회고 내용을 입력하세요',
        invalid_type_error: '회고 내용 형식이 올바르지 않습니다',
      })
      .refine((body) => body.trim().length > 0, '회고 내용을 입력하세요')
      .refine((body) => body.length <= 20000, '회고 내용은 20000자 이하로 입력하세요'),
  },
  {
    required_error: '회고 내용을 JSON 객체로 보내세요',
    invalid_type_error: '회고 내용을 JSON 객체로 보내세요',
  },
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
        path: ['start'],
        message:
          parsed.kind === 'weekly'
            ? '주간 회고는 일요일부터 시작합니다'
            : '월간 회고는 1일부터 시작합니다',
      },
    ]);
  return { kind: parsed.kind, ...period };
};

const columns = `id, kind, period_start AS "from", period_end AS "to", body,
  to_char(updated_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') AS "updatedAt"`;

const notFound = { error: '회고를 찾을 수 없습니다' };

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
          .number({ invalid_type_error: '조회 개수가 올바르지 않습니다' })
          .int('조회 개수가 올바르지 않습니다')
          .min(1, '조회 개수는 1 이상이어야 합니다')
          .max(100, '조회 개수는 100 이하여야 합니다')
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
