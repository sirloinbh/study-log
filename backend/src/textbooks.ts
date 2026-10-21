import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

const text = (label: string, max: number) =>
  z
    .string({ invalid_type_error: `${label} 형식이 올바르지 않습니다` })
    .trim()
    .max(max, `${label} 길이는 ${max}자 이하여야 합니다`);

const textbookInput = z.object(
  {
    title: z
      .string({
        required_error: '제목을 입력하세요',
        invalid_type_error: '제목 형식이 올바르지 않습니다',
      })
      .trim()
      .min(1, '제목을 입력하세요')
      .max(200, '제목 길이는 200자 이하여야 합니다'),
    author: text('저자', 200).default(''),
    edition: text('판본', 50).default(''),
  },
  {
    required_error: '교재 내용을 JSON 객체로 보내세요',
    invalid_type_error: '교재 내용을 JSON 객체로 보내세요',
  },
);

// Only plain positive integers that stay exact in JS and fit the bigint column; "1e3", "0x10"
// or 20-digit ids would otherwise reach Postgres and fail as a 500.
const idParam = z
  .string()
  .regex(/^[1-9]\d{0,14}$/, '교재 ID가 올바르지 않습니다')
  .transform(Number);

const columns = 'id::int AS id, title, author, edition';

const notFound = { error: '교재를 찾을 수 없습니다' };

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

  // Contents and exercises cascade; linked study logs will block deletion once #14 adds them.
  router.delete('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { rowCount } = await pool.query('DELETE FROM textbooks WHERE id = $1', [id]);
    if (!rowCount) return void res.status(404).json(notFound);
    res.status(204).end();
  });

  return router;
}
