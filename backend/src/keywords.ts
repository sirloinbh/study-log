import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { auditChange } from './audit-log.js';
import { calendarDate } from './dates.js';
import { inTransaction, likePattern } from './sql.js';
import { parseId } from './standard/http.js';
import { missingOrInvalid } from './validation.js';

const keywordDate = calendarDate(
  z.string({ error: 'The date format is invalid' }),
  'The date must be in YYYY-MM-DD format',
);

// `date` left out means today on add, and the stored date on update; the add route fills it in.
export const keywordInput = z.object(
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
export const keywordListQuery = z
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

const columns = `id, keyword_date AS date, keyword, memo`;

const notFound = { error: 'Keyword not found' };
const duplicate = { error: 'This keyword already exists on this date' };

const isDuplicate = (error: unknown) =>
  (error as { code?: string; constraint?: string }).code === '23505' &&
  (error as { constraint?: string }).constraint === 'keywords_date_keyword_key';

export function keywordRoutes(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { date, q, from, to, limit } = keywordListQuery.parse(req.query);
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
    const id = parseId(req.params.id, 'keyword');
    const { rows } = await pool.query(`SELECT ${columns} FROM keywords WHERE id = $1`, [id]);
    if (rows.length === 0) return void res.status(404).json(notFound);
    res.json({ keyword: rows[0] });
  });

  router.post('/', async (req, res) => {
    const input = keywordInput.parse(req.body);
    try {
      const { rows } = await inTransaction(pool, async (client) => {
        const added = await client.query(
          `INSERT INTO keywords (keyword_date, keyword, memo) VALUES ($1, $2, $3)
           RETURNING ${columns}`,
          [input.date ?? today(), input.keyword, input.memo],
        );
        await auditChange(req, res, client, 'create', 'keyword', added.rows[0].id, {
          keyword: added.rows[0].keyword,
          date: added.rows[0].date,
        });
        return added;
      });
      res.status(201).json({ keyword: rows[0] });
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      res.status(409).json(duplicate);
    }
  });

  // Replaces keyword and memo; a left-out date keeps the stored one, so editing only the word does
  // not move the keyword to today (#271).
  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'keyword');
    const input = keywordInput.parse(req.body);
    try {
      const { rows } = await inTransaction(pool, async (client) => {
        const changed = await client.query(
          `UPDATE keywords SET keyword_date = COALESCE($2::date, keyword_date), keyword = $3, memo = $4, updated_at = now()
           WHERE id = $1 RETURNING ${columns}`,
          [id, input.date ?? null, input.keyword, input.memo],
        );
        if (changed.rows[0])
          await auditChange(req, res, client, 'update', 'keyword', id, {
            keyword: changed.rows[0].keyword,
            date: changed.rows[0].date,
          });
        return changed;
      });
      if (rows.length === 0) return void res.status(404).json(notFound);
      res.json({ keyword: rows[0] });
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      res.status(409).json(duplicate);
    }
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'keyword');
    const deleted = await inTransaction(pool, async (client) => {
      const removed = await client.query(
        'DELETE FROM keywords WHERE id = $1 RETURNING keyword, keyword_date AS date',
        [id],
      );
      if (removed.rows[0])
        await auditChange(req, res, client, 'delete', 'keyword', id, removed.rows[0]);
      return removed.rowCount;
    });
    if (!deleted) return void res.status(404).json(notFound);
    res.status(204).end();
  });

  return router;
}
