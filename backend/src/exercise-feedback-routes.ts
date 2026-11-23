import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { auditChange } from './audit-log.js';
import { claudeSlots } from './claude-call.js';
import {
  type Feedbacker,
  FeedbackError,
  feedbackModes,
  solutionLimit,
} from './exercise-feedback.js';
import { detectFormat, receive } from './exercise-files.js';
import { inTransaction } from './sql.js';
import { parseId, requestIdOf } from './standard/http.js';

// Asking Claude for feedback on the solution of one attempt (#363):
// POST /api/exercise-attempts/:id/feedback, as JSON (a text solution) or multipart (a photo, with an
// optional text). The feedback is stored per attempt, so the history keeps each one.
export const feedbackInput = z.object({
  mode: z.enum(feedbackModes, {
    error: (issue) =>
      issue.input === undefined
        ? 'Choose a hint, a grade or an explanation'
        : 'The mode must be hint, grade or explanation',
  }),
  solution: z
    .string({ error: 'The solution format is invalid' })
    .max(solutionLimit, `The solution must be at most ${solutionLimit} characters`)
    .default(''),
});

export const feedbackColumns = `id, attempt_id AS "attemptId", mode, solution, has_image AS "hasImage",
  feedback, model, to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') AS "createdAt"`;

const notFound = { error: 'Attempt not found' };

export function feedbackRoutes(pool: Pool, feedbacker: Feedbacker) {
  const router = Router();

  router.post('/:id/feedback', async (req, res) => {
    const json = Boolean(req.is('application/json'));
    // The request costs money: a JSON body cannot come from another site's form, and a multipart one
    // needs the app's own header, as extraction does (#30).
    if (!json && !req.is('multipart/form-data'))
      return void res
        .status(415)
        .json({ error: 'Send the solution as JSON or multipart/form-data' });
    if (!json && req.get('x-requested-with') !== 'study-log')
      return void res.status(403).json({ error: 'Send solutions from the study log app' });
    const id = parseId(req.params.id, 'attempt');
    // Before reading a photo, so a missing attempt never holds up to 20 MB in memory.
    const found = await pool.query<{ problem: string; answer: string | null }>(
      `SELECT e.body AS problem, a.body AS answer FROM exercise_attempts t
       JOIN exercises e ON e.id = t.exercise_id
       LEFT JOIN exercise_answers a ON a.exercise_id = e.id WHERE t.id = $1`,
      [id],
    );
    if (!found.rows[0]) return void res.status(404).json(notFound);
    // At most a few paid calls at once, counted before the body is read (#267).
    if (!claudeSlots.enter()) {
      res.set('retry-after', '5');
      return void res
        .status(503)
        .json({ error: 'Too many files are being read or translated. Try again shortly' });
    }
    try {
      if (!json && !(await receive(req, res))) return;
      const input = feedbackInput.parse(req.body);
      const file = req.file;
      let image: { bytes: Buffer; type: 'image/jpeg' | 'image/png' } | undefined;
      if (file && file.size > 0) {
        const format = detectFormat(file.buffer);
        if (format?.type !== 'image/jpeg' && format?.type !== 'image/png')
          return void res.status(415).json({ error: 'Only JPEG and PNG photos can be sent' });
        image = { bytes: file.buffer, type: format.type };
      }
      const solution = input.solution.trim();
      if (!solution && !image)
        return void res.status(400).json({ error: 'Enter your solution or choose a photo of it' });

      // A request the person gave up on (tab closed) stops the paid call too.
      const stop = new AbortController();
      res.on('close', () => {
        if (!res.writableFinished) stop.abort();
      });
      let given;
      try {
        given = await feedbacker({
          mode: input.mode,
          problem: found.rows[0].problem,
          answer: found.rows[0].answer,
          solution,
          image,
          signal: stop.signal,
          requestId: requestIdOf(res),
        });
      } catch (error) {
        if (stop.signal.aborted) return;
        if (!(error instanceof FeedbackError)) throw error;
        return void res.status(error.status).json({ error: error.message });
      }
      if (stop.signal.aborted) return;
      try {
        const saved = await inTransaction(pool, async (client) => {
          const { rows } = await client.query(
            `INSERT INTO exercise_attempt_feedback
               (attempt_id, mode, solution, has_image, feedback, model)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${feedbackColumns}`,
            [id, input.mode, solution, Boolean(image), given.feedback, given.model],
          );
          await auditChange(req, res, client, 'create', 'exercise_attempt_feedback', rows[0].id, {
            attemptId: id,
            mode: input.mode,
          });
          return rows[0];
        });
        res.status(201).json({ feedback: saved });
      } catch (error) {
        // The attempt was deleted while Claude was answering.
        if ((error as { code?: string }).code !== '23503') throw error;
        res.status(404).json(notFound);
      }
    } finally {
      claudeSlots.leave();
    }
  });

  return router;
}
