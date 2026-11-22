import { type Response, Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { claudeSlots } from './claude-call.js';
import { detectFormat, receive, removeStoredFiles, storedKeys } from './exercise-files.js';
import { ExtractionError, extractionLimit, type Extractor } from './extraction.js';
import type { FileStorage } from './file-storage.js';
import { countPdfPages } from './pdf-pages.js';
import { inTransaction } from './sql.js';
import { parseId, requestIdOf } from './standard/http.js';
import { TranslationError, type Translator } from './translation.js';
import { missingOrInvalid } from './validation.js';

// The body keeps its line breaks and indentation as typed, so it is not trimmed; it only has to
// contain something other than whitespace.
export const exerciseInput = z.object(
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
export const answerInput = z.object(
  {
    body: z
      .string(missingOrInvalid('Enter the answer', 'The answer format is invalid'))
      .refine((body) => body.trim().length > 0, 'Enter the answer')
      .refine((body) => body.length <= 20000, 'The answer must be at most 20000 characters'),
  },
  { error: 'Send the answer as a JSON object' },
);

// Problems read from a file (#30), reviewed and saved into one chapter at once, each with its
// answer when the file showed one.
export const exerciseBulkInput = z.object(
  {
    // .max() first, as in textbook-contents.ts.
    exercises: z
      .array(
        exerciseInput.extend({
          answer: answerInput.shape.body.nullable().default(null),
        }),
        { error: 'Send the list of problems to save' },
      )
      .max(extractionLimit, `At most ${extractionLimit} problems can be saved at once`)
      .refine((value) => value.length >= 1, 'There are no problems to save'),
  },
  { error: 'Send the problems as a JSON object' },
);

// Answers read from an answers-only file (#30), each matched to an exercise of the chapter.
export const answersInput = z.object(
  {
    answers: z
      .array(
        z.object(
          {
            exerciseId: z
              .number({ error: 'Invalid exercise ID' })
              .int('Invalid exercise ID')
              .min(1, 'Invalid exercise ID')
              .max(999_999_999_999_999, 'Invalid exercise ID'),
            body: answerInput.shape.body,
          },
          { error: 'Send each answer as a JSON object' },
        ),
        { error: 'Send the list of answers to save' },
      )
      .max(extractionLimit, `At most ${extractionLimit} answers can be saved at once`)
      .refine((value) => value.length >= 1, 'There are no answers to save')
      .refine(
        (answers) => new Set(answers.map((a) => a.exerciseId)).size === answers.length,
        'Two answers are matched to the same problem',
      ),
  },
  { error: 'Send the answers as a JSON object' },
);

const extractionKind = z.enum(['problems', 'answers'], {
  error: 'Choose whether the file holds problems or answers',
});

export const importantInput = z.object(
  {
    important: z.boolean(
      missingOrInvalid('Send the important flag', 'The important flag format is invalid'),
    ),
  },
  { error: 'Send the important flag as a JSON object' },
);

// Filters for a textbook's exercises: one chapter (with its sections) and the important mark.
export const textbookListQuery = z.object({
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

// Most pages of one PDF that extraction reads at once (#267): about a chapter of exercises. More
// would be paid for and then refused as too much to read.
export const maxExtractionPages = 30;

// The answer when every paid-call slot is taken: try again shortly.
const busy = (res: Response) => {
  res.set('retry-after', '5');
  res.status(503).json({ error: 'Too many files are being read or translated. Try again shortly' });
};
const answerNotFound = { error: 'Answer not found' };

// Listing and adding the exercises of one chapter: /api/textbooks/:textbookId/contents/:contentId/exercises
// Also reading problems or answers out of a file and saving them at once (#30).
export function contentExerciseRoutes(pool: Pool, extractor: Extractor) {
  const router = Router({ mergeParams: true });
  // Chapters being read right now: a second request for one is answered 409 instead of paying
  // twice.
  const extracting = new Set<number>();
  const chapterExists = async (textbookId: number, contentId: number) =>
    Boolean(
      (
        await pool.query('SELECT 1 FROM textbook_contents WHERE id = $1 AND textbook_id = $2', [
          contentId,
          textbookId,
        ])
      ).rowCount,
    );
  const target = (params: Record<string, string>) => ({
    textbookId: parseId(params.textbookId, 'textbook'),
    contentId: parseId(params.contentId, 'contents entry'),
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

  // Reads the problems, or the answers, in one PDF or photo with Claude (#30) and returns them for
  // review. Nothing is saved, and the file is not kept.
  router.post('/extract', async (req, res) => {
    // As for uploads (#28): another site's form cannot add this header, and reading costs money.
    if (req.get('x-requested-with') !== 'study-log')
      return void res.status(403).json({ error: 'Read files from the study log app' });
    if (!req.is('multipart/form-data'))
      return void res.status(415).json({ error: 'Send the file as multipart/form-data' });
    const { textbookId, contentId } = target(req.params);
    // Before reading the body, as for uploads.
    if (!(await chapterExists(textbookId, contentId)))
      return void res.status(404).json(contentNotFound);
    if (extracting.has(contentId))
      return void res.status(409).json({ error: 'A file is already being read for this section' });
    // At most a few paid calls at once, counted before the body is read (#267).
    if (!claudeSlots.enter()) return void busy(res);
    extracting.add(contentId);
    try {
      if (!(await receive(req, res))) return;
      const kind = extractionKind.parse((req.body as Record<string, unknown> | undefined)?.kind);
      const file = req.file;
      if (!file || file.size === 0) return void res.status(400).json({ error: 'Choose a file' });
      const format = detectFormat(file.buffer);
      if (!format)
        return void res.status(415).json({ error: 'Only PDF, JPEG and PNG files can be read' });
      // Too many pages would be paid for and then refused as too much to read (#267).
      const pages = format.type === 'application/pdf' ? countPdfPages(file.buffer) : undefined;
      if (pages !== undefined && pages > maxExtractionPages)
        return void res.status(400).json({
          error: `The PDF has ${pages} pages. Read at most ${maxExtractionPages} pages at once`,
        });
      // A request the person gave up on (tab closed) stops the paid call too.
      const stop = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) stop.abort();
      });
      try {
        res.json(
          await extractor({
            bytes: file.buffer,
            type: format.type,
            kind,
            signal: stop.signal,
            requestId: requestIdOf(res),
          }),
        );
      } catch (error) {
        if (!(error instanceof ExtractionError)) throw error;
        res.status(error.status).json({ error: error.message });
      }
    } finally {
      claudeSlots.leave();
      extracting.delete(contentId);
    }
  });

  // Saves reviewed problems into the chapter, with their answers, all or nothing (#30).
  router.post('/bulk', async (req, res) => {
    const { textbookId, contentId } = target(req.params);
    const { exercises } = exerciseBulkInput.parse(req.body);
    const reply = await inTransaction<{ status: number; body: unknown }>(
      pool,
      async (client) => {
        // Held until the end, so the chapter cannot be deleted halfway through.
        const content = await client.query(
          'SELECT 1 FROM textbook_contents WHERE id = $1 AND textbook_id = $2 FOR SHARE',
          [contentId, textbookId],
        );
        if (!content.rowCount) return { status: 404, body: contentNotFound };
        for (const exercise of exercises) {
          const { rows } = await client.query<{ id: number }>(
            `INSERT INTO exercises (textbook_id, content_id, number, body, important)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [textbookId, contentId, exercise.number, exercise.body, exercise.important],
          );
          if (exercise.answer !== null)
            await client.query('INSERT INTO exercise_answers (exercise_id, body) VALUES ($1, $2)', [
              rows[0].id,
              exercise.answer,
            ]);
        }
        const { rows } = await client.query(
          `SELECT ${columns} FROM exercises WHERE textbook_id = $1 AND content_id = $2 ORDER BY id`,
          [textbookId, contentId],
        );
        return { status: 201, body: { exercises: rows } };
      },
      (reply) => reply.status < 400,
    );
    res.status(reply.status).json(reply.body);
  });

  // Saves answers read from an answers-only file into the chapter's exercises they were matched
  // to, replacing answers already there, all or nothing (#30).
  router.put('/answers', async (req, res) => {
    const { textbookId, contentId } = target(req.params);
    const { answers } = answersInput.parse(req.body);
    const ids = answers.map((answer) => answer.exerciseId);
    const reply = await inTransaction<{ status: number; body: unknown }>(
      pool,
      async (client) => {
        const content = await client.query(
          'SELECT 1 FROM textbook_contents WHERE id = $1 AND textbook_id = $2',
          [contentId, textbookId],
        );
        if (!content.rowCount) return { status: 404, body: contentNotFound };
        // Locked, so none of them is deleted or moved before the answers are in; in id order, so
        // two saves over the same exercises never wait on each other in a deadlock.
        const { rows } = await client.query(
          `SELECT id FROM exercises
           WHERE id = ANY($1::bigint[]) AND textbook_id = $2 AND content_id = $3
           ORDER BY id FOR UPDATE`,
          [ids, textbookId, contentId],
        );
        if (rows.length !== ids.length)
          return {
            status: 400,
            body: { error: 'Some problems are no longer in this section. Reload and match again' },
          };
        await client.query(
          `INSERT INTO exercise_answers (exercise_id, body)
           SELECT * FROM unnest($1::bigint[], $2::text[])
           ON CONFLICT (exercise_id) DO UPDATE SET body = EXCLUDED.body, updated_at = now()`,
          [ids, answers.map((answer) => answer.body)],
        );
        return { status: 200, body: { saved: answers.length } };
      },
      (reply) => reply.status < 400,
    );
    res.status(reply.status).json(reply.body);
  });

  return router;
}

// Exercises across a textbook (#27): /api/textbooks/:textbookId/exercises?contentId=&important=
// Ordered as the contents are (chapter, then its sections), then in the order they were added.
export function textbookExerciseRoutes(pool: Pool) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const textbookId = parseId((req.params as Record<string, string>).textbookId, 'textbook');
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
export function exerciseRoutes(pool: Pool, translator: Translator, storage: FileStorage) {
  const router = Router();
  // Exercises being translated right now: a second request for one is answered 409 instead of
  // paying for the same translation twice.
  const translating = new Set<number>();

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'exercise');
    const { rows } = await pool.query(`SELECT ${columns} FROM exercises WHERE id = $1`, [id]);
    if (rows.length === 0) return void res.status(404).json(notFound);
    res.json({ exercise: rows[0] });
  });

  // Replaces number, body and the important mark; the chapter stays as it is.
  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'exercise');
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
    const id = parseId(req.params.id, 'exercise');
    const { important } = importantInput.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE exercises SET important = $2, updated_at = now() WHERE id = $1 RETURNING ${columns}`,
      [id, important],
    );
    if (rows.length === 0) return void res.status(404).json(notFound);
    res.json({ exercise: rows[0] });
  });

  // Its stored files go too (#209), after the row is deleted and committed (#265); a file S3 will
  // not remove is logged for a sweep and never blocks or undoes the delete.
  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'exercise');
    let keys: string[] = [];
    const reply = await inTransaction<{ status: number; body?: unknown }>(
      pool,
      async (client) => {
        const stored = await storedKeys(client, { exerciseId: id });
        const { rowCount } = await client.query('DELETE FROM exercises WHERE id = $1', [id]);
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

  // The answer of one exercise (#26): `{ answer: null }` until one is saved.
  router.get('/:id/answer', async (req, res) => {
    const id = parseId(req.params.id, 'exercise');
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
    const id = parseId(req.params.id, 'exercise');
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
    const id = parseId(req.params.id, 'exercise');
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
    const id = parseId(req.params.id, 'exercise');
    if (translating.has(id))
      return void res.status(409).json({ error: 'This problem is already being translated' });
    if (!claudeSlots.enter()) return void busy(res);
    translating.add(id);
    try {
      await translate(id, res);
    } finally {
      claudeSlots.leave();
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
      translated = await translator({ ...source, requestId: requestIdOf(res) });
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
    const id = parseId(req.params.id, 'exercise');
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
