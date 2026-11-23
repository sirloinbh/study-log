import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { auditChange } from './audit-log.js';
import { calendarDate } from './dates.js';
import { syncFirstReview } from './reviews.js';
import { inTransaction, likePattern } from './sql.js';
import { parseId } from './standard/http.js';
import { studyMinutes } from './study-logs.js';
import { missingOrInvalid } from './validation.js';

// The coding problem log (#368): problems with many attempts each.
export const codingSites = ['baekjoon', 'leetcode', 'other'] as const;
export type CodingSite = (typeof codingSites)[number];
export const codingResults = ['solved', 'partial', 'failed'] as const;

const siteLabel: Record<CodingSite, string> = {
  baekjoon: 'Baekjoon',
  leetcode: 'LeetCode',
  other: 'Other',
};

const day = calendarDate(
  z.string({ error: 'The date format is invalid' }),
  'The date must be in YYYY-MM-DD format',
);

// The link is shown on the screen, so only http and https pass: never a javascript: or data: URL.
const link = z
  .string({ error: 'The link format is invalid' })
  .trim()
  .refine((value) => value.length <= 500, 'The link must be at most 500 characters')
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return (protocol === 'http:' || protocol === 'https:') && !/\s/.test(value);
    } catch {
      return false;
    }
  }, 'The link must start with http:// or https://');

const title = z
  .string(missingOrInvalid('Enter the problem title', 'The problem title format is invalid'))
  .trim()
  .refine((value) => value.length >= 1, 'Enter the problem title')
  .refine((value) => value.length <= 200, 'The problem title must be at most 200 characters')
  .regex(/^[^\r\n]*$/, 'The problem title must be on one line');

const clock = z
  .string(missingOrInvalid('Enter the start time', 'The start time format is invalid'))
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'The start time must be in HH:MM format');

// `studyLog` asks for a study log of the same day and length (the form's checkbox); it needs the
// minutes and a start time, since a log has a start and an end.
const attemptFields = {
  date: day.optional(),
  result: z.enum(codingResults, { error: 'The result must be solved, partial, or failed' }),
  language: z
    .string({ error: 'The language format is invalid' })
    .trim()
    .refine((value) => value.length <= 30, 'The language must be at most 30 characters')
    .regex(/^[^\r\n]*$/, 'The language must be on one line')
    .default(''),
  minutes: z
    .number({ error: 'The minutes must be a whole number from 1 to 1439' })
    .int('The minutes must be a whole number from 1 to 1439')
    .min(1, 'The minutes must be a whole number from 1 to 1439')
    .max(1439, 'The minutes must be a whole number from 1 to 1439')
    .nullable()
    .default(null),
  notes: z
    .string({ error: 'The notes format is invalid' })
    .refine((value) => value.length <= 5000, 'The notes must be at most 5000 characters')
    .default(''),
};
const asObject = { error: 'Send the attempt as a JSON object' };

export const attemptInput = z
  .object(
    { ...attemptFields, studyLog: z.object({ startTime: clock }, asObject).optional() },
    asObject,
  )
  .refine((attempt) => attempt.studyLog === undefined || attempt.minutes !== null, {
    error: 'Enter the minutes to also record a study log',
    path: ['minutes'],
  });

// An edit changes the attempt only: a study log made earlier is left as it is.
export const attemptUpdateInput = z.object(attemptFields, asObject);

// What identifies a problem on its site (dedupes the import in #369 and #370): the Baekjoon
// number, the LeetCode title slug in lower case, or short text for another site.
function keyIssue(site: CodingSite, key: string) {
  if (site === 'baekjoon' && !/^[1-9]\d{0,6}$/.test(key))
    return 'A Baekjoon problem number is digits only, like 1000';
  if (site === 'leetcode' && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key))
    return 'A LeetCode problem is its title slug, like two-sum';
  if (site === 'other' && (key.length < 1 || key.length > 100 || /[\r\n]/.test(key)))
    return 'The problem ID must be 1 to 100 characters on one line';
  return undefined;
}

export const problemInput = z
  .object(
    {
      site: z.enum(codingSites, { error: 'The site must be baekjoon, leetcode, or other' }),
      problemKey: z
        .string(missingOrInvalid('Enter the problem ID', 'The problem ID format is invalid'))
        .trim()
        .refine((value) => value.length >= 1, 'Enter the problem ID'),
      title,
      url: link.optional(),
      // The first attempt, saved with the problem.
      attempt: attemptInput.optional(),
    },
    { error: 'Send the problem as a JSON object' },
  )
  .transform((input) => ({
    ...input,
    problemKey: input.site === 'leetcode' ? input.problemKey.toLowerCase() : input.problemKey,
  }))
  .superRefine((input, ctx) => {
    const issue = keyIssue(input.site, input.problemKey);
    if (issue) ctx.addIssue({ code: 'custom', message: issue, path: ['problemKey'] });
  });

export const problemUpdateInput = z.object(
  { title, url: link.nullable().default(null) },
  { error: 'Send the problem as a JSON object' },
);

export const problemListQuery = z
  .object({
    site: z
      .enum(codingSites, { error: 'The site must be baekjoon, leetcode, or other' })
      .optional(),
    result: z
      .enum(codingResults, { error: 'The result must be solved, partial, or failed' })
      .optional(),
    q: z
      .string({ error: 'The search term format is invalid' })
      .trim()
      .refine((value) => value.length <= 50, 'The search term must be at most 50 characters')
      .optional(),
    from: day.optional(),
    to: day.optional(),
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

export function defaultUrl(site: CodingSite, key: string) {
  if (site === 'baekjoon') return `https://www.acmicpc.net/problem/${key}`;
  if (site === 'leetcode') return `https://leetcode.com/problems/${key}/`;
  return null;
}

const problemColumns = `p.id, p.site, p.problem_key AS "problemKey", p.title, p.url`;
const attemptColumns = `id, attempt_date AS date, result, language, minutes, notes,
  study_log_id AS "studyLogId"`;

const problemNotFound = { error: 'Problem not found' };
const attemptNotFound = { error: 'Attempt not found' };
const duplicate = { error: 'This problem is already recorded. Add an attempt to it instead' };

const isDuplicate = (error: unknown) =>
  (error as { code?: string; constraint?: string }).code === '23505' &&
  (error as { constraint?: string }).constraint === 'coding_problems_site_key_key';

type Db = Pick<Pool | PoolClient, 'query'>;

async function loadAttempts(db: Db, problemId: number) {
  const { rows } = await db.query(
    `SELECT ${attemptColumns} FROM coding_attempts WHERE problem_id = $1
     ORDER BY attempt_date DESC, id DESC`,
    [problemId],
  );
  return rows;
}

type AttemptInput = z.output<typeof attemptInput>;
type Problem = { id: number; site: CodingSite; problemKey: string; title: string };

// Saves one attempt on `date`, and a study log for it when asked. Runs in the caller's transaction.
async function addAttempt(
  client: PoolClient,
  problem: Problem,
  input: AttemptInput,
  date: string,
  audit: (entity: string, id: number, summary: Record<string, unknown>) => Promise<void>,
) {
  let studyLogId: number | null = null;
  if (input.studyLog && input.minutes !== null) {
    const start = input.studyLog.startTime;
    const total = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + input.minutes;
    const endTime = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    const memo = `${siteLabel[problem.site]} ${problem.problemKey} ${problem.title}`;
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO study_logs (study_date, start_time, end_time, duration_minutes, memo, status, study_type)
       VALUES ($1, $2, $3, $4, $5, 'done', 'new') RETURNING id`,
      [date, start, endTime, studyMinutes(start, endTime), memo.slice(0, 10000)],
    );
    studyLogId = rows[0].id;
    // A done log gets its first review like any other (reviews.ts).
    await syncFirstReview(client, studyLogId, undefined, { status: 'done', studyDate: date });
    await audit('study_log', studyLogId, { studyDate: date, status: 'done', source: 'coding' });
  }
  const { rows } = await client.query(
    `INSERT INTO coding_attempts (problem_id, attempt_date, result, language, minutes, notes, study_log_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${attemptColumns}`,
    [problem.id, date, input.result, input.language, input.minutes, input.notes, studyLogId],
  );
  await audit('coding_attempt', rows[0].id, {
    problemId: problem.id,
    date,
    result: input.result,
    studyLogId,
  });
  return rows[0];
}

// /api/coding (#368). The same rules as the other records: validated here, written in a
// transaction with its audit row.
export function codingRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // The problems with how many attempts, the minutes in all, and the latest attempt. `result` and the
  // dates narrow by the latest attempt, so "solved" lists the problems whose last try solved them.
  router.get('/problems', async (req, res) => {
    const { site, result, q, from, to, limit } = problemListQuery.parse(req.query);
    const params: unknown[] = [];
    const where: string[] = [];
    if (site) where.push(`p.site = $${params.push(site)}`);
    if (result) where.push(`la.result = $${params.push(result)}`);
    if (from) where.push(`la.attempt_date >= $${params.push(from)}`);
    if (to) where.push(`la.attempt_date <= $${params.push(to)}`);
    if (q) {
      const pattern = `$${params.push(likePattern(q))}`;
      where.push(`(p.title ILIKE ${pattern} OR p.problem_key ILIKE ${pattern})`);
    }
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT ${problemColumns}, s.count::int AS "attemptCount", s.minutes::int AS "totalMinutes",
         la.attempt_date AS "lastAttemptDate", la.result AS "lastResult"
       FROM coding_problems p
       LEFT JOIN LATERAL (
         SELECT count(*) AS count, COALESCE(sum(minutes), 0) AS minutes
         FROM coding_attempts WHERE problem_id = p.id) s ON true
       LEFT JOIN LATERAL (
         SELECT attempt_date, result FROM coding_attempts WHERE problem_id = p.id
         ORDER BY attempt_date DESC, id DESC LIMIT 1) la ON true
       ${filter}
       ORDER BY la.attempt_date DESC NULLS LAST, p.id DESC LIMIT $${params.push(limit)}`,
      params,
    );
    res.json({ problems: rows });
  });

  router.get('/problems/:id', async (req, res) => {
    const id = parseId(req.params.id, 'problem');
    const { rows } = await pool.query(
      `SELECT ${problemColumns} FROM coding_problems p WHERE p.id = $1`,
      [id],
    );
    if (!rows[0]) return void res.status(404).json(problemNotFound);
    res.json({ problem: rows[0], attempts: await loadAttempts(pool, id) });
  });

  // Adds a problem, with its first attempt when one is sent.
  router.post('/problems', async (req, res) => {
    const input = problemInput.parse(req.body);
    try {
      const created = await inTransaction(pool, async (client) => {
        const url = input.url ?? defaultUrl(input.site, input.problemKey);
        const { rows } = await client.query<Problem & { url: string | null }>(
          `INSERT INTO coding_problems (site, problem_key, title, url) VALUES ($1, $2, $3, $4)
           RETURNING id, site, problem_key AS "problemKey", title, url`,
          [input.site, input.problemKey, input.title, url],
        );
        const problem = rows[0];
        await auditChange(req, res, client, 'create', 'coding_problem', problem.id, {
          site: problem.site,
          problemKey: problem.problemKey,
          title: problem.title,
        });
        const attempts = input.attempt
          ? [
              await addAttempt(
                client,
                problem,
                input.attempt,
                input.attempt.date ?? today(),
                (entity, id, summary) =>
                  auditChange(req, res, client, 'create', entity, id, summary),
              ),
            ]
          : [];
        return { problem, attempts };
      });
      res.status(201).json(created);
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      res.status(409).json(duplicate);
    }
  });

  // The title and the link; the site and the ID name the problem and stay.
  router.put('/problems/:id', async (req, res) => {
    const id = parseId(req.params.id, 'problem');
    const input = problemUpdateInput.parse(req.body);
    const found = await inTransaction(pool, async (client) => {
      // A removed link falls back to the site's own address.
      const { rows } = await client.query<{ id: number; site: CodingSite; problemKey: string }>(
        'SELECT id, site, problem_key AS "problemKey" FROM coding_problems WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!rows[0]) return undefined;
      const url = input.url ?? defaultUrl(rows[0].site, rows[0].problemKey);
      const { rows: saved } = await client.query(
        `UPDATE coding_problems p SET title = $2, url = $3, updated_at = now() WHERE p.id = $1
         RETURNING ${problemColumns}`,
        [id, input.title, url],
      );
      await auditChange(req, res, client, 'update', 'coding_problem', id, { title: input.title });
      return saved[0];
    });
    if (!found) return void res.status(404).json(problemNotFound);
    res.json({ problem: found });
  });

  // Its attempts go with it; study logs made from them stay.
  router.delete('/problems/:id', async (req, res) => {
    const id = parseId(req.params.id, 'problem');
    const deleted = await inTransaction(pool, async (client) => {
      const removed = await client.query(
        'DELETE FROM coding_problems WHERE id = $1 RETURNING site, problem_key AS "problemKey", title',
        [id],
      );
      if (removed.rows[0])
        await auditChange(req, res, client, 'delete', 'coding_problem', id, removed.rows[0]);
      return removed.rowCount;
    });
    if (!deleted) return void res.status(404).json(problemNotFound);
    res.status(204).end();
  });

  router.post('/problems/:id/attempts', async (req, res) => {
    const id = parseId(req.params.id, 'problem');
    const input = attemptInput.parse(req.body);
    const attempt = await inTransaction(pool, async (client) => {
      // The problem stays while its attempt is added.
      const { rows } = await client.query<Problem>(
        `SELECT id, site, problem_key AS "problemKey", title FROM coding_problems
         WHERE id = $1 FOR SHARE`,
        [id],
      );
      if (!rows[0]) return undefined;
      return addAttempt(
        client,
        rows[0],
        input,
        input.date ?? today(),
        (entity, entityId, summary) =>
          auditChange(req, res, client, 'create', entity, entityId, summary),
      );
    });
    if (!attempt) return void res.status(404).json(problemNotFound);
    res.status(201).json({ attempt });
  });

  // A left-out date keeps the stored one, as for keywords.
  router.put('/attempts/:id', async (req, res) => {
    const id = parseId(req.params.id, 'attempt');
    const input = attemptUpdateInput.parse(req.body);
    const attempt = await inTransaction(pool, async (client) => {
      const { rows } = await client.query(
        `UPDATE coding_attempts SET attempt_date = COALESCE($2::date, attempt_date), result = $3,
           language = $4, minutes = $5, notes = $6, updated_at = now()
         WHERE id = $1 RETURNING ${attemptColumns}, problem_id AS "problemId"`,
        [id, input.date ?? null, input.result, input.language, input.minutes, input.notes],
      );
      if (!rows[0]) return undefined;
      await auditChange(req, res, client, 'update', 'coding_attempt', id, {
        problemId: rows[0].problemId,
        date: rows[0].date,
        result: input.result,
      });
      return rows[0];
    });
    if (!attempt) return void res.status(404).json(attemptNotFound);
    const { problemId: _problemId, ...shown } = attempt;
    res.json({ attempt: shown });
  });

  router.delete('/attempts/:id', async (req, res) => {
    const id = parseId(req.params.id, 'attempt');
    const deleted = await inTransaction(pool, async (client) => {
      const removed = await client.query(
        'DELETE FROM coding_attempts WHERE id = $1 RETURNING problem_id AS "problemId", result',
        [id],
      );
      if (removed.rows[0])
        await auditChange(req, res, client, 'delete', 'coding_attempt', id, removed.rows[0]);
      return removed.rowCount;
    });
    if (!deleted) return void res.status(404).json(attemptNotFound);
    res.status(204).end();
  });

  return router;
}
