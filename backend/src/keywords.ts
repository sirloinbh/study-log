import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { calendarDate } from './dates.js';
import { likePattern } from './sql.js';
import { missingOrInvalid } from './validation.js';

const keywordDate = calendarDate(
  z.string({ error: 'The date format is invalid' }),
  'The date must be in YYYY-MM-DD format',
);

// `date` left out means today in the service time zone; the route fills it in.
const keywordInput = z.object(
  {
    date: keywordDate.optional(),
    keyword: z
      .string(missingOrInvalid('Enter a keyword', 'The keyword format is invalid'))
      .trim()
      .refine((value) => value.length >= 1, 'Enter a keyword')
      .refine((value) => value.length <= 50, 'The keyword must be at most 50 characters')
      .regex(/^[^\r\n]*$/, 'The keyword must be on one line'),
    memo: z
      .string({ error: 'The memo format is invalid' })
      .refine((value) => value.length <= 2000, 'The memo must be at most 2000 characters')
      .default(''),
  },
  { error: 'Send the keyword as a JSON object' },
);

// ?date for one day; otherwise the most recent keywords, narrowed by ?q (keyword or memo, any
// case) and ?from/?to.
const listQuery = z
  .object({
    date: keywordDate.optional(),
    q: z
      .string({ error: 'The search term format is invalid' })
      .trim()
      .refine((value) => value.length <= 50, 'The search term must be at most 50 characters')
      .optional(),
    from: keywordDate.optional(),
    to: keywordDate.optional(),
    limit: z.coerce
      .number({ error: 'The limit is invalid' })
      .int('The limit is invalid')
      .min(1, 'The limit must be at least 1')
      .max(200, 'The limit must be at most 200')
      .default(50),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    error: 'The start date cannot be after the end date',
  });

// Same rule as the other ids: plain positive integers that stay exact in JS and fit bigint.
const idParam = z
  .string()
  .regex(/^[1-9]\d{0,14}$/, 'Invalid keyword ID')
  .transform(Number);

const columns = `id, keyword_date AS date, keyword, memo`;

const notFound = { error: 'Keyword not found' };
const duplicate = { error: 'This keyword already exists on this date' };

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
