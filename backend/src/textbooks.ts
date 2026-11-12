import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { missingOrInvalid } from './validation.js';

const text = (label: string, max: number) =>
  z
    .string({ error: `The ${label} format is invalid` })
    .trim()
    .refine((value) => value.length <= max, `The ${label} must be at most ${max} characters`);

const textbookInput = z.object(
  {
    title: z
      .string(missingOrInvalid('Enter the title', 'The title format is invalid'))
      .trim()
      .refine((value) => value.length >= 1, 'Enter the title')
      .refine((value) => value.length <= 200, 'The title must be at most 200 characters'),
    author: text('author', 200).default(''),
    edition: text('edition', 50).default(''),
  },
  { error: 'Send the textbook as a JSON object' },
);

// Only plain positive integers that stay exact in JS and fit the bigint column; "1e3", "0x10"
// or 20-digit ids would otherwise reach Postgres and fail as a 500.
const idParam = z
  .string()
  .regex(/^[1-9]\d{0,14}$/, 'Invalid textbook ID')
  .transform(Number);

const columns = 'id, title, author, edition';

const notFound = { error: 'Textbook not found' };

export function textbookRoutes(pool: Pool) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const { rows } = await pool.query(`SELECT ${columns} FROM textbooks ORDER BY title, id`);
    res.json({ textbooks: rows });
  });

  router.get('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { rows } = await pool.query(`SELECT ${columns} FROM textbooks WHERE id = $1`, [id]);
    if (rows.length === 0) return void res.status(404).json(notFound);
    res.json({ textbook: rows[0] });
  });

  router.post('/', async (req, res) => {
    const book = textbookInput.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO textbooks (title, author, edition) VALUES ($1, $2, $3) RETURNING ${columns}`,
      [book.title, book.author, book.edition],
    );
    res.status(201).json({ textbook: rows[0] });
  });

  router.put('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const book = textbookInput.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE textbooks SET title = $2, author = $3, edition = $4, updated_at = now()
       WHERE id = $1 RETURNING ${columns}`,
      [id, book.title, book.author, book.edition],
    );
    if (rows.length === 0) return void res.status(404).json(notFound);
    res.json({ textbook: rows[0] });
  });

  // Contents and exercises cascade; study logs and schedules that point to the textbook or one of
  // its chapters block the deletion (foreign keys with RESTRICT).
  router.delete('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    let rowCount: number | null;
    try {
      ({ rowCount } = await pool.query('DELETE FROM textbooks WHERE id = $1', [id]));
    } catch (error) {
      if ((error as { code?: string }).code !== '23503') throw error;
      return void res
        .status(409)
        .json({ error: 'A textbook with a study log or schedule attached cannot be deleted' });
    }
    if (!rowCount) return void res.status(404).json(notFound);
    res.status(204).end();
  });

  return router;
}
