import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

// Same rule as the other ids: plain positive integers that stay exact in JS and fit bigint.
const pathId = (label: string) =>
  z
    .string()
    .regex(/^[1-9]\d{0,14}$/, `${label} ID가 올바르지 않습니다`)
    .transform(Number);
const textbookIdParam = pathId('교재');
const contentIdParam = pathId('목차');
const exerciseIdParam = pathId('연습문제');

// The body keeps its line breaks and indentation as typed, so it is not trimmed; it only has to
// contain something other than whitespace.
const exerciseInput = z.object(
  {
    number: z
      .string({ invalid_type_error: '문제 번호 형식이 올바르지 않습니다' })
      .trim()
      .max(20, '문제 번호 길이는 20자 이하여야 합니다')
      .default(''),
    body: z
      .string({
        required_error: '문제 본문을 입력하세요',
        invalid_type_error: '문제 본문 형식이 올바르지 않습니다',
      })
      .refine((body) => body.trim().length > 0, '문제 본문을 입력하세요')
      .refine((body) => body.length <= 20000, '문제 본문은 20000자 이하로 입력하세요'),
    important: z
      .boolean({ invalid_type_error: '중요 표시 형식이 올바르지 않습니다' })
      .default(false),
  },
  {
    required_error: '연습문제 내용을 JSON 객체로 보내세요',
    invalid_type_error: '연습문제 내용을 JSON 객체로 보내세요',
  },
);

// The answer body follows the exercise body: line breaks kept, not trimmed.
const answerInput = z.object(
  {
    body: z
      .string({
        required_error: '정답을 입력하세요',
        invalid_type_error: '정답 형식이 올바르지 않습니다',
      })
      .refine((body) => body.trim().length > 0, '정답을 입력하세요')
      .refine((body) => body.length <= 20000, '정답은 20000자 이하로 입력하세요'),
  },
  {
    required_error: '정답 내용을 JSON 객체로 보내세요',
    invalid_type_error: '정답 내용을 JSON 객체로 보내세요',
  },
);

const columns = `id::int AS id, textbook_id::int AS "textbookId", content_id::int AS "contentId",
  number, body, important`;

const contentNotFound = { error: '목차를 찾을 수 없습니다' };
const notFound = { error: '연습문제를 찾을 수 없습니다' };
const answerNotFound = { error: '정답을 찾을 수 없습니다' };

// Listing and adding the exercises of one chapter: /api/textbooks/:textbookId/contents/:contentId/exercises
export function contentExerciseRoutes(pool: Pool) {
  const router = Router({ mergeParams: true });
  const target = (params: Record<string, string>) => ({
    textbookId: textbookIdParam.parse(params.textbookId),
    contentId: contentIdParam.parse(params.contentId),
  });

  router.get('/', async (req, res) => {
    const { textbookId, contentId } = target(req.params);
    const content = await pool.query(
      'SELECT 1 FROM textbook_contents WHERE id = $1 AND textbook_id = $2',
      [contentId, textbookId],
    );
    if (!content.rowCount) return void res.status(404).json(contentNotFound);
    const { rows } = await pool.query(
      `SELECT ${columns} FROM exercises WHERE textbook_id = $1 AND content_id = $2 ORDER BY id`,
      [textbookId, contentId],
    );
    res.json({ exercises: rows });
  });

  router.post('/', async (req, res) => {
    const { textbookId, contentId } = target(req.params);
    const exercise = exerciseInput.parse(req.body);
    try {
      const { rows } = await pool.query(
        `INSERT INTO exercises (textbook_id, content_id, number, body, important)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${columns}`,
        [textbookId, contentId, exercise.number, exercise.body, exercise.important],
      );
      res.status(201).json({ exercise: rows[0] });
    } catch (error) {
      // A chapter that does not exist, or belongs to another textbook, fails the foreign key.
      if ((error as { code?: string }).code !== '23503') throw error;
      res.status(404).json(contentNotFound);
    }
  });

  return router;
}

// Reading, editing and deleting one exercise and its answer: /api/exercises/:id(/answer)
export function exerciseRoutes(pool: Pool) {
  const router = Router();

  router.get('/:id', async (req, res) => {
    const id = exerciseIdParam.parse(req.params.id);
    const { rows } = await pool.query(`SELECT ${columns} FROM exercises WHERE id = $1`, [id]);
    if (rows.length === 0) return void res.status(404).json(notFound);
    res.json({ exercise: rows[0] });
  });

  // Replaces number, body and the important mark; the chapter stays as it is.
  router.put('/:id', async (req, res) => {
    const id = exerciseIdParam.parse(req.params.id);
    const exercise = exerciseInput.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE exercises SET number = $2, body = $3, important = $4, updated_at = now()
       WHERE id = $1 RETURNING ${columns}`,
      [id, exercise.number, exercise.body, exercise.important],
    );
    if (rows.length === 0) return void res.status(404).json(notFound);
    res.json({ exercise: rows[0] });
  });

  router.delete('/:id', async (req, res) => {
    const id = exerciseIdParam.parse(req.params.id);
    const { rowCount } = await pool.query('DELETE FROM exercises WHERE id = $1', [id]);
    if (!rowCount) return void res.status(404).json(notFound);
    res.status(204).end();
  });

  // The answer of one exercise (#26): `{ answer: null }` until one is saved.
  router.get('/:id/answer', async (req, res) => {
    const id = exerciseIdParam.parse(req.params.id);
    const { rows } = await pool.query(
      `SELECT a.body FROM exercises e LEFT JOIN exercise_answers a ON a.exercise_id = e.id
       WHERE e.id = $1`,
      [id],
    );
    if (rows.length === 0) return void res.status(404).json(notFound);
    const { body } = rows[0] as { body: string | null };
    res.json({ answer: body === null ? null : { exerciseId: id, body } });
  });

  // Saves the answer, replacing the one already there.
  router.put('/:id/answer', async (req, res) => {
    const id = exerciseIdParam.parse(req.params.id);
    const { body } = answerInput.parse(req.body);
    try {
      const { rows } = await pool.query(
        `INSERT INTO exercise_answers (exercise_id, body) VALUES ($1, $2)
         ON CONFLICT (exercise_id) DO UPDATE SET body = EXCLUDED.body, updated_at = now()
         RETURNING exercise_id::int AS "exerciseId", body`,
        [id, body],
      );
      res.json({ answer: rows[0] });
    } catch (error) {
      // The exercise does not exist (or was just deleted): its foreign key fails.
      if ((error as { code?: string }).code !== '23503') throw error;
      res.status(404).json(notFound);
    }
  });

  router.delete('/:id/answer', async (req, res) => {
    const id = exerciseIdParam.parse(req.params.id);
    const { rowCount } = await pool.query('DELETE FROM exercise_answers WHERE exercise_id = $1', [
      id,
    ]);
    if (rowCount) return void res.status(204).end();
    // Nothing deleted: say whether the exercise or only its answer is missing.
    const exercise = await pool.query('SELECT 1 FROM exercises WHERE id = $1', [id]);
    res.status(404).json(exercise.rowCount ? answerNotFound : notFound);
  });

  return router;
}
