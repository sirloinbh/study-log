import { type Response, Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { TranslationError, type Translator } from './translation.js';
import { missingOrInvalid } from './validation.js';

// Same rule as the other ids: plain positive integers that stay exact in JS and fit bigint.
const pathId = (label: string) =>
  z
    .string()
    .regex(/^[1-9]\d{0,14}$/, `Invalid ${label} ID`)
    .transform(Number);
const textbookIdParam = pathId('textbook');
const contentIdParam = pathId('contents entry');
const exerciseIdParam = pathId('exercise');

// The body keeps its line breaks and indentation as typed, so it is not trimmed; it only has to
// contain something other than whitespace.
const exerciseInput = z.object(
  {
    number: z
      .string({ error: 'The problem number format is invalid' })
      .trim()
      .refine((value) => value.length <= 20, 'The problem number must be at most 20 characters')
      .default(''),
    body: z
      .string(missingOrInvalid('Enter the problem text', 'The problem text format is invalid'))
      .refine((body) => body.trim().length > 0, 'Enter the problem text')
      .refine((body) => body.length <= 20000, 'The problem text must be at most 20000 characters'),
    important: z.boolean({ error: 'The important flag format is invalid' }).default(false),
  },
  { error: 'Send the exercise as a JSON object' },
);

// The answer body follows the exercise body: line breaks kept, not trimmed.
const answerInput = z.object(
  {
    body: z
      .string(missingOrInvalid('Enter the answer', 'The answer format is invalid'))
      .refine((body) => body.trim().length > 0, 'Enter the answer')
      .refine((body) => body.length <= 20000, 'The answer must be at most 20000 characters'),
  },
  { error: 'Send the answer as a JSON object' },
);

const importantInput = z.object(
  {
    important: z.boolean(
      missingOrInvalid('Send the important flag', 'The important flag format is invalid'),
    ),
  },
  { error: 'Send the important flag as a JSON object' },
);

// Filters for a textbook's exercises: one chapter (with its sections) and the important mark.
const textbookListQuery = z.object({
  contentId: z
    .string({ error: 'Invalid contents entry ID' })
    .regex(/^[1-9]\d{0,14}$/, 'Invalid contents entry ID')
    .transform(Number)
    .optional(),
  important: z
    .enum(['true', 'false'], { error: 'The important filter is invalid' })
    .transform((value) => value === 'true')
    .optional(),
});

const columns = `id, textbook_id AS "textbookId", content_id AS "contentId",
  number, body, important`;

const contentNotFound = { error: 'Contents entry not found' };
const notFound = { error: 'Exercise not found' };
const answerNotFound = { error: 'Answer not found' };

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

// Exercises across a textbook (#27): /api/textbooks/:textbookId/exercises?contentId=&important=
// Ordered as the contents are (chapter, then its sections), then in the order they were added.
export function textbookExerciseRoutes(pool: Pool) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const textbookId = textbookIdParam.parse((req.params as Record<string, string>).textbookId);
    const { contentId, important } = textbookListQuery.parse(req.query);
    const found = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM textbooks WHERE id = $1) AS textbook,
         EXISTS (SELECT 1 FROM textbook_contents WHERE id = $2 AND textbook_id = $1) AS content`,
      [textbookId, contentId ?? null],
    );
    const { textbook, content } = found.rows[0] as { textbook: boolean; content: boolean };
    if (!textbook) return void res.status(404).json({ error: 'Textbook not found' });
    if (contentId !== undefined && !content) return void res.status(404).json(contentNotFound);
    // Walks the tree from the top-level chapters, or from the one chapter asked for, keeping the
    // sibling positions on the way down so the rows come out in contents order.
    const { rows } = await pool.query(
      `WITH RECURSIVE tree AS (
         SELECT id AS node, ARRAY[position] AS path FROM textbook_contents
         WHERE textbook_id = $1 AND (CASE WHEN $2::bigint IS NULL THEN parent_id IS NULL
                                          ELSE id = $2 END)
         UNION ALL
         SELECT c.id, t.path || c.position FROM textbook_contents c
         JOIN tree t ON c.textbook_id = $1 AND c.parent_id = t.node
       )
       SELECT ${columns} FROM exercises JOIN tree ON tree.node = content_id
       WHERE textbook_id = $1 AND ($3::boolean IS NULL OR important = $3)
       ORDER BY tree.path, id`,
      [textbookId, contentId ?? null, important ?? null],
    );
    res.json({ exercises: rows });
  });

  return router;
}

const translationColumns = `t.body, t.answer, t.model,
  to_char(t.updated_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') AS "updatedAt",
  (t.source_body <> e.body OR t.source_answer IS DISTINCT FROM a.body) AS stale`;

// Reading, editing and deleting one exercise, its answer and its translation:
// /api/exercises/:id(/answer|/translation)
export function exerciseRoutes(pool: Pool, translator: Translator) {
  const router = Router();
  // Exercises being translated right now: a second request for one waits for the first instead of
  // paying for the same translation twice.
  const translating = new Set<number>();

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

  // Marks or unmarks the exercise as important (#27), leaving the rest as it is.
  router.patch('/:id/important', async (req, res) => {
    const id = exerciseIdParam.parse(req.params.id);
    const { important } = importantInput.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE exercises SET important = $2, updated_at = now() WHERE id = $1 RETURNING ${columns}`,
      [id, important],
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
         RETURNING exercise_id AS "exerciseId", body`,
        [id, body],
      );
      res.json({ answer: rows[0] });
    } catch (error) {
      // The exercise does not exist (or was just deleted): its foreign key fails.
      if ((error as { code?: string }).code !== '23503') throw error;
      res.status(404).json(notFound);
    }
  });

  // The Korean translation (#31): `{ translation: null }` until one is made. `stale` says the
  // exercise or its answer changed after it was made.
  router.get('/:id/translation', async (req, res) => {
    const id = exerciseIdParam.parse(req.params.id);
    const { rows } = await pool.query(
      `SELECT e.id, t.exercise_id AS "translated", ${translationColumns}
       FROM exercises e LEFT JOIN exercise_answers a ON a.exercise_id = e.id
       LEFT JOIN exercise_translations t ON t.exercise_id = e.id WHERE e.id = $1`,
      [id],
    );
    if (rows.length === 0) return void res.status(404).json(notFound);
    const { translated, id: _id, ...translation } = rows[0];
    res.json({ translation: translated === null ? null : translation });
  });

  // Translates the exercise and its answer as they are now with Claude, replacing the previous
  // translation. Nothing is saved when the translation fails.
  router.post('/:id/translation', async (req, res) => {
    // Only a JSON request, which another site's page cannot send without a CORS preflight this
    // server never allows: translating costs money, so a form or a no-cors fetch must not start it.
    if (!req.is('application/json'))
      return void res.status(415).json({ error: 'Send the translation request as JSON' });
    const id = exerciseIdParam.parse(req.params.id);
    if (translating.has(id))
      return void res.status(409).json({ error: 'This problem is already being translated' });
    translating.add(id);
    try {
      await translate(id, res);
    } finally {
      translating.delete(id);
    }
  });

  const translate = async (id: number, res: Response) => {
    const { rows } = await pool.query<{ body: string; answer: string | null }>(
      `SELECT e.body, a.body AS answer FROM exercises e
       LEFT JOIN exercise_answers a ON a.exercise_id = e.id WHERE e.id = $1`,
      [id],
    );
    if (rows.length === 0) return void res.status(404).json(notFound);
    const source = rows[0];
    let translated;
    try {
      translated = await translator(source);
    } catch (error) {
      if (!(error instanceof TranslationError)) throw error;
      return void res.status(error.status).json({ error: error.message });
    }
    try {
      await pool.query(
        `INSERT INTO exercise_translations
           (exercise_id, body, answer, source_body, source_answer, model)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (exercise_id) DO UPDATE SET body = EXCLUDED.body, answer = EXCLUDED.answer,
           source_body = EXCLUDED.source_body, source_answer = EXCLUDED.source_answer,
           model = EXCLUDED.model, updated_at = now()`,
        [id, translated.body, translated.answer, source.body, source.answer, translated.model],
      );
    } catch (error) {
      // The exercise was deleted while it was being translated.
      if ((error as { code?: string }).code !== '23503') throw error;
      return void res.status(404).json(notFound);
    }
    const saved = await pool.query(
      `SELECT ${translationColumns} FROM exercises e
       LEFT JOIN exercise_answers a ON a.exercise_id = e.id
       JOIN exercise_translations t ON t.exercise_id = e.id WHERE e.id = $1`,
      [id],
    );
    if (saved.rows.length === 0) return void res.status(404).json(notFound);
    res.json({ translation: saved.rows[0] });
  };

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
