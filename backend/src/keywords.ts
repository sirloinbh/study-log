import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { likePattern } from './sql.js';
import { isCalendarDate } from './study-logs.js';

const keywordDate = z
  .string({ invalid_type_error: '날짜 형식이 올바르지 않습니다' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜는 YYYY-MM-DD 형식으로 입력하세요')
  .refine(isCalendarDate, '존재하지 않는 날짜입니다');

// `date` left out means today in the service time zone; the route fills it in.
const keywordInput = z.object(
  {
    date: keywordDate.optional(),
    keyword: z
      .string({
        required_error: '키워드를 입력하세요',
        invalid_type_error: '키워드 형식이 올바르지 않습니다',
      })
      .trim()
      .min(1, '키워드를 입력하세요')
      .max(50, '키워드는 50자 이하로 입력하세요')
      .regex(/^[^\r\n]*$/, '키워드는 한 줄로 입력하세요'),
    memo: z
      .string({ invalid_type_error: '메모 형식이 올바르지 않습니다' })
      .max(2000, '메모는 2000자 이하로 입력하세요')
      .default(''),
  },
  {
    required_error: '키워드 내용을 JSON 객체로 보내세요',
    invalid_type_error: '키워드 내용을 JSON 객체로 보내세요',
  },
);

// ?date for one day; otherwise the most recent keywords, narrowed by ?q (keyword or memo, any
// case) and ?from/?to.
const listQuery = z
  .object({
    date: keywordDate.optional(),
    q: z
      .string({ invalid_type_error: '검색어 형식이 올바르지 않습니다' })
      .trim()
      .max(50, '검색어는 50자 이하로 입력하세요')
      .optional(),
    from: keywordDate.optional(),
    to: keywordDate.optional(),
    limit: z.coerce
      .number({ invalid_type_error: '조회 개수가 올바르지 않습니다' })
      .int('조회 개수가 올바르지 않습니다')
      .min(1, '조회 개수는 1 이상이어야 합니다')
      .max(200, '조회 개수는 200 이하여야 합니다')
      .default(50),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: '시작일은 종료일보다 늦을 수 없습니다',
  });

// Same rule as the other ids: plain positive integers that stay exact in JS and fit bigint.
const idParam = z
  .string()
  .regex(/^[1-9]\d{0,14}$/, '키워드 ID가 올바르지 않습니다')
  .transform(Number);

const columns = `id, keyword_date AS date, keyword, memo`;

const notFound = { error: '키워드를 찾을 수 없습니다' };
const duplicate = { error: '이 날짜에 이미 있는 키워드입니다' };

const isDuplicate = (error: unknown) =>
  (error as { code?: string; constraint?: string }).code === '23505' &&
  (error as { constraint?: string }).constraint === 'keywords_date_keyword_key';

export function keywordRoutes(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { date, q, from, to, limit } = listQuery.parse(req.query);
    if (date) {
      const { rows } = await pool.query(
        `SELECT ${columns} FROM keywords WHERE keyword_date = $1 ORDER BY id`,
        [date],
      );
      return void res.json({ keywords: rows });
    }
    const params: unknown[] = [];
    const where: string[] = [];
    if (q) {
      const pattern = `$${params.push(likePattern(q))}`;
      where.push(`(keyword ILIKE ${pattern} OR memo ILIKE ${pattern})`);
    }
    if (from) where.push(`keyword_date >= $${params.push(from)}`);
    if (to) where.push(`keyword_date <= $${params.push(to)}`);
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT ${columns} FROM keywords ${filter}
       ORDER BY keyword_date DESC, id LIMIT $${params.push(limit)}`,
      params,
    );
    res.json({ keywords: rows });
  });

  router.get('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { rows } = await pool.query(`SELECT ${columns} FROM keywords WHERE id = $1`, [id]);
    if (rows.length === 0) return void res.status(404).json(notFound);
    res.json({ keyword: rows[0] });
  });

  router.post('/', async (req, res) => {
    const input = keywordInput.parse(req.body);
    try {
      const { rows } = await pool.query(
        `INSERT INTO keywords (keyword_date, keyword, memo) VALUES ($1, $2, $3)
         RETURNING ${columns}`,
        [input.date ?? today(), input.keyword, input.memo],
      );
      res.status(201).json({ keyword: rows[0] });
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      res.status(409).json(duplicate);
    }
  });

  // Replaces date, keyword and memo; a left-out date means today, as when adding.
  router.put('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = keywordInput.parse(req.body);
    try {
      const { rows } = await pool.query(
        `UPDATE keywords SET keyword_date = $2, keyword = $3, memo = $4, updated_at = now()
         WHERE id = $1 RETURNING ${columns}`,
        [id, input.date ?? today(), input.keyword, input.memo],
      );
      if (rows.length === 0) return void res.status(404).json(notFound);
      res.json({ keyword: rows[0] });
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      res.status(409).json(duplicate);
    }
  });

  router.delete('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { rowCount } = await pool.query('DELETE FROM keywords WHERE id = $1', [id]);
    if (!rowCount) return void res.status(404).json(notFound);
    res.status(204).end();
  });

  return router;
}
