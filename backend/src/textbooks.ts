import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { removeStoredFiles, storedKeys } from './exercise-files.js';
import type { FileStorage } from './file-storage.js';
import { inTransaction } from './sql.js';
import { parseId } from './standard/http.js';
import { missingOrInvalid } from './validation.js';

const text = (label: string, max: number) =>
  z
    .string({ error: `The ${label} format is invalid` })
    .trim()
    .refine((value) => value.length <= max, `The ${label} must be at most ${max} characters`);

export const textbookInput = z.object(
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

const columns = 'id, title, author, edition';

const notFound = { error: 'Textbook not found' };

export function textbookRoutes(pool: Pool, storage: FileStorage) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const { rows } = await pool.query(`SELECT ${columns} FROM textbooks ORDER BY title, id`);
    res.json({ textbooks: rows });
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'textbook');
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
    const id = parseId(req.params.id, 'textbook');
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
  // its chapters block the deletion (foreign keys with RESTRICT). The stored files of its exercises
  // go too (#209), but only after the rows are deleted and committed (#265): if S3 then cannot
  // remove a file, the delete stands and the key is logged for a sweep, so no row ever points at a
  // file that is gone.
  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'textbook');
    let keys: string[] = [];
    const reply = await inTransaction<{ status: number; body?: unknown }>(
      pool,
      async (client) => {
        // The textbook first, then its exercises: the same order as a chapter delete
        // (writeContents), so the two never wait on each other in a deadlock.
        const book = await client.query('SELECT 1 FROM textbooks WHERE id = $1 FOR UPDATE', [id]);
        if (!book.rowCount) return { status: 404, body: notFound };
        const stored = await storedKeys(client, { textbookId: id });
        let rowCount: number | null;
        try {
          ({ rowCount } = await client.query('DELETE FROM textbooks WHERE id = $1', [id]));
        } catch (error) {
          if ((error as { code?: string }).code !== '23503') throw error;
          return {
            status: 409,
            body: { error: 'A textbook with a study log or schedule attached cannot be deleted' },
          };
        }
        if (!rowCount) return { status: 404, body: notFound };
        keys = stored;
        return { status: 204 };
      },
      (reply) => reply.status < 400,
    );
    if (reply.status === 204) await removeStoredFiles(storage, keys);
    if (reply.body === undefined) return void res.status(reply.status).end();
    res.status(reply.status).json(reply.body);
  });

  return router;
}
