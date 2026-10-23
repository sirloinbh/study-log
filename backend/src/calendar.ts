import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

const query = z.object({
  month: z
    .string({ invalid_type_error: '월 형식이 올바르지 않습니다' })
    .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, '월은 YYYY-MM 형식으로 입력하세요')
    .optional(),
});

// The first and last day of a YYYY-MM month, as YYYY-MM-DD strings.
export function monthRange(month: string) {
  const [year, number] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

// Study log calendar (#17): /api/study-logs/calendar?month=YYYY-MM (this month by default).
// Each day of the month with the minutes studied (planned logs do not count, as in the stats)
// and how many logs it has (planned ones included, so a day with only a plan still opens).
export function calendarRoutes(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/', async (req, res) => {
    const month = query.parse(req.query).month ?? today().slice(0, 7);
    const { from, to } = monthRange(month);
    const { rows } = await pool.query(
      `SELECT day::date AS date,
         COALESCE(sum(l.duration_minutes) FILTER (WHERE l.status <> 'planned'), 0)::int AS minutes,
         count(l.id)::int AS logs
       FROM generate_series($1::date, $2::date, interval '1 day') AS day
       LEFT JOIN study_logs l ON l.study_date = day::date
       GROUP BY day ORDER BY day`,
      [from, to],
    );
    res.json({ month, days: rows });
  });

  return router;
}
