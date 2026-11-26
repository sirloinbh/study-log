import type { Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { auditChange } from './audit-log.js';
import {
  goalFields,
  type GoalItem,
  guessMapping,
  type Mapping,
  mapRows,
  maxFileBytes,
  maxSheetRows,
  type Skipped,
} from './coding-goal-import.js';
import { progressOf, stateOf } from './coding-goal-progress.js';
import { codingSites, defaultUrl } from './coding-problems.js';
import { calendarDate } from './dates.js';
import { inTransaction } from './sql.js';
import { HttpError, parseId } from './standard/http.js';

type Db = Pick<Pool | PoolClient, 'query'>;

// One sheet of a workbook as rows of text; the first row is the header. Dates come as YYYY-MM-DD.
export type Sheet = { name: string; rows: string[][] };
// Reads an .xlsx file; a stand-in in tests (#425).
export type WorkbookReader = (file: Buffer) => Promise<Sheet[]>;

const upload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: { fileSize: maxFileBytes, files: 1, fields: 8, parts: 10 },
}).single('file');

// Runs multer; what it refuses becomes a client error, as for the other uploads.
async function receive(req: Request, res: Response) {
  try {
    await new Promise<void>((resolve, reject) =>
      upload(req, res, (error: unknown) => (error ? reject(error) : resolve())),
    );
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE')
      throw new HttpError(413, 'The file must be at most 2 MB');
    if (
      error instanceof multer.MulterError &&
      (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE')
    )
      throw new HttpError(400, 'Send one file in the file field');
    throw new HttpError(400, 'Could not read the uploaded file');
  }
  if (!req.file) throw new HttpError(400, 'Send an .xlsx file in the file field');
  return req.file.buffer;
}

async function readSheets(read: WorkbookReader, file: Buffer) {
  // An .xlsx file is a zip archive.
  if (file.length < 4 || file[0] !== 0x50 || file[1] !== 0x4b)
    throw new HttpError(400, 'The file is not an .xlsx workbook');
  let sheets: Sheet[];
  try {
    sheets = await read(file);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Could not read the workbook. Is it a valid .xlsx file?');
  }
  if (sheets.length === 0) throw new HttpError(400, 'The workbook has no sheets');
  return sheets;
}

const dateQuery = z.object({
  date: calendarDate(
    z.string({ error: 'The date format is invalid' }),
    'The date must be in YYYY-MM-DD format',
  ).optional(),
});

const oneLine = (label: string, max: number) =>
  z
    .string({ error: `The ${label} format is invalid` })
    .trim()
    .min(1, `Enter the ${label}`)
    .refine((value) => value.length <= max, `The ${label} must be at most ${max} characters`)
    .regex(/^[^\r\n]*$/, `The ${label} must be on one line`);

const mappingInput = z.partialRecord(z.enum(goalFields), z.number().int().min(0).max(200), {
  error: 'The column mapping format is invalid',
});

const importFields = z.object({
  sheet: oneLine('sheet name', 100),
  name: oneLine('list name', 100),
  site: z.enum(codingSites, { error: 'The site must be baekjoon, leetcode, or other' }),
  // An empty field means no date.
  targetDate: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    calendarDate(
      z.string({ error: 'The target date format is invalid' }),
      'The target date must be in YYYY-MM-DD format',
    ).optional(),
  ),
  mapping: z.string({ error: 'Send the column mapping' }),
  dryRun: z.enum(['0', '1', 'true', 'false']).optional(),
});

export type ImportPlan = {
  listExists: boolean;
  total: number;
  willAdd: number;
  willUpdate: number;
  unchanged: number;
  // Items of the list that the file no longer holds; they stay.
  notInFile: number;
  // Items whose problem already has a row in the problem log.
  alreadyLogged: number;
  // Attempts the first import adds from the sheet's own progress columns; none for a re-import.
  attemptsToAdd: number;
  skipped: Skipped[];
  blank: number;
  sample: Pick<GoalItem, 'site' | 'problemKey' | 'title' | 'topic' | 'level'>[];
};

type Stored = {
  site: string;
  problemKey: string;
  title: string;
  group: string;
  topic: string;
  level: number | null;
  targetDate: string | null;
  position: number;
};

const identity = (site: string, key: string) => `${site}:${key}`;
const same = (a: Stored, b: GoalItem) =>
  a.title === b.title &&
  a.group === b.group &&
  a.topic === b.topic &&
  a.level === b.level &&
  // A target date the file does not give leaves the stored one alone.
  (b.targetDate === null || a.targetDate === b.targetDate) &&
  a.position === b.position;

// Compares the file's items with the list of the same name, and with the problem log.
async function plan(
  db: Db,
  name: string,
  mapped: { items: GoalItem[]; skipped: Skipped[]; blank: number },
): Promise<{
  summary: ImportPlan;
  listId: number | undefined;
  toAdd: GoalItem[];
  toUpdate: GoalItem[];
}> {
  const list = await db.query<{ id: number }>(`SELECT id FROM coding_goal_lists WHERE name = $1`, [
    name,
  ]);
  const listId = list.rows[0]?.id;
  const stored = new Map<string, Stored>();
  if (listId !== undefined) {
    const { rows } = await db.query<Stored>(
      `SELECT site, problem_key AS "problemKey", title, group_name AS "group", topic, level,
              to_char(target_date, 'YYYY-MM-DD') AS "targetDate", position
       FROM coding_goal_items WHERE list_id = $1`,
      [listId],
    );
    for (const row of rows) stored.set(identity(row.site, row.problemKey), row);
  }
  const toAdd: GoalItem[] = [];
  const toUpdate: GoalItem[] = [];
  let unchanged = 0;
  const inFile = new Set<string>();
  for (const item of mapped.items) {
    const key = identity(item.site, item.problemKey);
    inFile.add(key);
    const current = stored.get(key);
    if (!current) toAdd.push(item);
    else if (same(current, item)) unchanged += 1;
    else toUpdate.push(item);
  }
  const logged = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM coding_problems p
     WHERE (p.site, p.problem_key) IN (
       SELECT * FROM unnest($1::text[], $2::text[]))`,
    [mapped.items.map((i) => i.site), mapped.items.map((i) => i.problemKey)],
  );
  return {
    summary: {
      listExists: listId !== undefined,
      total: mapped.items.length,
      willAdd: toAdd.length,
      willUpdate: toUpdate.length,
      unchanged,
      notInFile: [...stored.keys()].filter((key) => !inFile.has(key)).length,
      alreadyLogged: logged.rows[0].count,
      attemptsToAdd: listId === undefined ? mapped.items.filter((i) => i.attempt).length : 0,
      skipped: mapped.skipped,
      blank: mapped.blank,
      sample: mapped.items.slice(0, 5).map(({ site, problemKey, title, topic, level }) => ({
        site,
        problemKey,
        title,
        topic,
        level,
      })),
    },
    listId,
    toAdd,
    toUpdate,
  };
}

const columns = (items: GoalItem[]) => [
  items.map((i) => i.site),
  items.map((i) => i.problemKey),
  items.map((i) => i.title),
  items.map((i) => i.group),
  items.map((i) => i.topic),
  items.map((i) => i.level),
  items.map((i) => i.targetDate),
  items.map((i) => i.position),
];

// /api/coding/goals (#425): goal lists imported from an Excel file.
type GoalItemRow = {
  id: number;
  listId: number;
  site: string;
  problemKey: string;
  title: string;
  group: string;
  topic: string;
  level: number | null;
  targetDate: string | null;
  dueDate: string | null;
  position: number;
  problemId: number | null;
  attemptCount: number;
  solvedDate: string | null;
};

// The items with the state of their problem: its attempts and the latest solved one.
async function loadItems(db: Db, listId?: number): Promise<GoalItemRow[]> {
  const { rows } = await db.query<GoalItemRow>(
    `SELECT i.id, i.list_id AS "listId", i.site, i.problem_key AS "problemKey", i.title,
            i.group_name AS "group", i.topic, i.level, i.position, p.id AS "problemId",
            to_char(i.target_date, 'YYYY-MM-DD') AS "targetDate",
            to_char(COALESCE(i.target_date, l.target_date), 'YYYY-MM-DD') AS "dueDate",
            COALESCE(s.attempts, 0)::int AS "attemptCount",
            to_char(s.solved_date, 'YYYY-MM-DD') AS "solvedDate"
     FROM coding_goal_items i
     JOIN coding_goal_lists l ON l.id = i.list_id
     LEFT JOIN coding_problems p ON p.site = i.site AND p.problem_key = i.problem_key
     LEFT JOIN LATERAL (
       SELECT count(*) AS attempts, max(attempt_date) FILTER (WHERE result = 'solved') AS solved_date
       FROM coding_attempts WHERE problem_id = p.id) s ON true
     ${listId === undefined ? '' : 'WHERE i.list_id = $1'}
     ORDER BY i.list_id, i.position, i.id`,
    listId === undefined ? [] : [listId],
  );
  return rows;
}

const withState = (items: GoalItemRow[], today: string) =>
  items.map((item) => ({ ...item, state: stateOf(item, today) }));
const nextCount = 3;

export function codingGoalRoutes(pool: Pool, read: WorkbookReader, today: () => string) {
  const router = Router();

  // Step 1: what is in the file, so the screen can offer the sheets and the guessed columns.
  router.post('/inspect', async (req, res) => {
    const sheets = await readSheets(read, await receive(req, res));
    res.json({
      sheets: sheets.map((sheet) => ({
        name: sheet.name,
        headers: sheet.rows[0] ?? [],
        rowCount: Math.max(0, sheet.rows.length - 1),
        tooLong: sheet.rows.length - 1 > maxSheetRows,
        preview: sheet.rows.slice(1, 4),
        mapping: guessMapping(sheet.rows[0] ?? []),
      })),
    });
  });

  // Step 2 (dryRun) shows what would happen; the same request without it does it.
  router.post('/import', async (req, res) => {
    const file = await receive(req, res);
    const fields = importFields.parse(req.body);
    let mapping: Mapping;
    try {
      mapping = mappingInput.parse(JSON.parse(fields.mapping));
    } catch {
      throw new HttpError(400, 'The column mapping format is invalid');
    }
    if (mapping.key === undefined && mapping.url === undefined)
      throw new HttpError(400, 'Choose the column that holds the problem number or link');
    const sheets = await readSheets(read, file);
    const sheet = sheets.find((candidate) => candidate.name === fields.sheet);
    if (!sheet) throw new HttpError(400, 'The workbook has no sheet with that name');
    if (sheet.rows.length - 1 > maxSheetRows)
      throw new HttpError(
        400,
        `The sheet has more than ${maxSheetRows.toLocaleString('en-US')} rows`,
      );
    const mapped = mapRows(sheet.rows, mapping, fields.site);
    const dry = fields.dryRun === '1' || fields.dryRun === 'true';
    if (dry) return void res.json({ plan: (await plan(pool, fields.name, mapped)).summary });
    if (mapped.items.length === 0)
      throw new HttpError(400, 'No row of the sheet can be imported. Check the column mapping');

    const result = await inTransaction(pool, async (client) => {
      // Two imports of the same list wait for each other, so a repeat sees the first one's items.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('coding_goal_import'))`);
      const found = await plan(client, fields.name, mapped);
      let listId = found.listId;
      if (listId === undefined) {
        const created = await client.query<{ id: number }>(
          `INSERT INTO coding_goal_lists (name, target_date) VALUES ($1, $2) RETURNING id`,
          [fields.name, fields.targetDate ?? null],
        );
        listId = created.rows[0].id;
      } else if (fields.targetDate) {
        await client.query(
          `UPDATE coding_goal_lists SET target_date = $2, updated_at = now()
           WHERE id = $1 AND target_date IS DISTINCT FROM $2::date`,
          [listId, fields.targetDate],
        );
      }
      if (found.toAdd.length > 0)
        await client.query(
          `INSERT INTO coding_goal_items
             (list_id, site, problem_key, title, group_name, topic, level, target_date, position)
           SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
             $7::smallint[], $8::date[], $9::int[])`,
          [listId, ...columns(found.toAdd)],
        );
      if (found.toUpdate.length > 0)
        await client.query(
          `UPDATE coding_goal_items i SET title = u.title, group_name = u.group_name, topic = u.topic,
             level = u.level, target_date = COALESCE(u.target_date, i.target_date),
             position = u.position, updated_at = now()
           FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
             $7::smallint[], $8::date[], $9::int[])
             AS u(site, problem_key, title, group_name, topic, level, target_date, position)
           WHERE i.list_id = $1 AND i.site = u.site AND i.problem_key = u.problem_key`,
          [listId, ...columns(found.toUpdate)],
        );
      // The sheet's own progress becomes attempts on the first import only (user decision 2026-11-26).
      let attemptsAdded = 0;
      let problemsAdded = 0;
      const marked = found.listId === undefined ? found.toAdd.filter((i) => i.attempt) : [];
      if (marked.length > 0) {
        const added = await client.query(
          `INSERT INTO coding_problems (site, problem_key, title, url, level)
           SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::smallint[])
           ON CONFLICT ON CONSTRAINT coding_problems_site_key_key DO NOTHING`,
          [
            marked.map((i) => i.site),
            marked.map((i) => i.problemKey),
            marked.map((i) => i.title),
            marked.map((i) => defaultUrl(i.site, i.problemKey)),
            marked.map((i) => (i.site === 'baekjoon' ? i.level : null)),
          ],
        );
        problemsAdded = added.rowCount ?? 0;
        const attempts = await client.query(
          `INSERT INTO coding_attempts (problem_id, attempt_date, result, notes)
           SELECT p.id, a.day, a.result, a.notes
           FROM unnest($1::text[], $2::text[], $3::date[], $4::text[], $5::text[])
             AS a(site, key, day, result, notes)
           JOIN coding_problems p ON p.site = a.site AND p.problem_key = a.key
           WHERE NOT EXISTS (
             SELECT 1 FROM coding_attempts x
             WHERE x.problem_id = p.id AND x.attempt_date = a.day AND x.result = a.result)`,
          [
            marked.map((i) => i.site),
            marked.map((i) => i.problemKey),
            marked.map((i) => i.attempt!.date),
            marked.map((i) => i.attempt!.result),
            marked.map((i) => i.attempt!.notes),
          ],
        );
        attemptsAdded = attempts.rowCount ?? 0;
      }
      // One audit row for the import with counts only, not one per problem.
      if (found.toAdd.length > 0 || found.toUpdate.length > 0 || !found.listId)
        await auditChange(
          req,
          res,
          client,
          found.listId === undefined ? 'create' : 'update',
          'coding_goal_list',
          listId,
          {
            name: fields.name,
            added: found.toAdd.length,
            updated: found.toUpdate.length,
            attempts: attemptsAdded,
            problems: problemsAdded,
          },
        );
      return { listId, plan: found.summary, created: found.listId === undefined };
    });
    res.status(result.created ? 201 : 200).json({ id: result.listId, plan: result.plan });
  });

  // Each list with its progress and the next problems to solve, in order.
  router.get('/', async (_req, res) => {
    const day = today();
    const lists = await pool.query<{ id: number; name: string; targetDate: string | null }>(
      `SELECT id, name, to_char(target_date, 'YYYY-MM-DD') AS "targetDate"
       FROM coding_goal_lists ORDER BY name`,
    );
    const items = withState(await loadItems(pool), day);
    res.json({
      lists: lists.rows.map((list) => {
        const own = items.filter((item) => item.listId === list.id);
        return {
          ...list,
          ...progressOf(own, day),
          alreadyLogged: own.filter((item) => item.problemId !== null).length,
          next: own.filter((item) => item.state !== 'solved').slice(0, nextCount),
        };
      }),
    });
  });

  // What the day log shows (#426): per list, the problems due on the day, the ones solved on the day
  // and the next ones in order. Before '/:id', where 'today' would be read as a list id.
  router.get('/today', async (req, res) => {
    const { date } = dateQuery.parse(req.query);
    const day = date ?? today();
    const lists = await pool.query<{ id: number; name: string }>(
      `SELECT id, name FROM coding_goal_lists ORDER BY name`,
    );
    const items = withState(await loadItems(pool), day);
    const solvedOn = await pool.query<{ id: number }>(
      `SELECT DISTINCT i.id FROM coding_goal_items i
       JOIN coding_problems p ON p.site = i.site AND p.problem_key = i.problem_key
       JOIN coding_attempts a ON a.problem_id = p.id
       WHERE a.attempt_date = $1 AND a.result = 'solved'`,
      [day],
    );
    const solvedToday = new Set(solvedOn.rows.map((row) => row.id));
    res.json({
      date: day,
      lists: lists.rows.map((list) => {
        const own = items.filter((item) => item.listId === list.id);
        return {
          id: list.id,
          name: list.name,
          planned: own.filter((item) => item.dueDate === day),
          solved: own.filter((item) => solvedToday.has(item.id)),
          next: own.filter((item) => item.state !== 'solved').slice(0, nextCount),
        };
      }),
    });
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'goal list');
    const day = today();
    const list = await pool.query(
      `SELECT id, name, to_char(target_date, 'YYYY-MM-DD') AS "targetDate"
       FROM coding_goal_lists WHERE id = $1`,
      [id],
    );
    if (!list.rows[0]) return void res.status(404).json({ error: 'Goal list not found' });
    const items = withState(await loadItems(pool, id), day);
    res.json({ list: list.rows[0], progress: progressOf(items, day), today: day, items });
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'goal list');
    const deleted = await inTransaction(pool, async (client) => {
      const { rows } = await client.query<{ name: string }>(
        `DELETE FROM coding_goal_lists WHERE id = $1 RETURNING name`,
        [id],
      );
      if (!rows[0]) return false;
      await auditChange(req, res, client, 'delete', 'coding_goal_list', id, { name: rows[0].name });
      return true;
    });
    if (!deleted) return void res.status(404).json({ error: 'Goal list not found' });
    res.status(204).end();
  });

  return router;
}
