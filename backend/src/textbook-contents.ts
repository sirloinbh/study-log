import { type Response, Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { inTransaction } from './sql.js';
import { missingOrInvalid } from './validation.js';

// Same rule as the textbook id: plain positive integers that stay exact in JS and fit bigint.
const pathId = (label: string) =>
  z
    .string()
    .regex(/^[1-9]\d{0,14}$/, `Invalid ${label} ID`)
    .transform(Number);
const textbookIdParam = pathId('textbook');
const contentIdParam = pathId('contents entry');

export const bodyId = (label: string) => {
  const message = `Invalid ${label} ID`;
  return z
    .number({ error: message })
    .int(message)
    .min(1, message)
    .max(999_999_999_999_999, message);
};

const asObject = { error: 'Send the contents entry as a JSON object' };

const entryFields = {
  number: z
    .string({ error: 'The number format is invalid' })
    .trim()
    .refine((value) => value.length <= 20, 'The number must be at most 20 characters')
    .default(''),
  title: z
    .string(missingOrInvalid('Enter the contents title', 'The contents title format is invalid'))
    .trim()
    .refine((value) => value.length >= 1, 'Enter the contents title')
    .refine((value) => value.length <= 200, 'The contents title must be at most 200 characters'),
};

// A new entry goes last among its siblings; no parent means a top-level chapter.
const createInput = z.object(
  { parentId: bodyId('parent contents entry').nullable().default(null), ...entryFields },
  asObject,
);
const updateInput = z.object(entryFields, asObject);
// A length limit keeps one oversized request from raising an issue per element
// (zod 3 advisory GHSA-mrhx-c7xc-m3w5, sirloinbh/project-standards#326).
export const orderLimit = 1000;
const orderInput = z.object(
  {
    parentId: bodyId('parent contents entry').nullable().default(null),
    // .max() first: zod 4.6.7 rejects before reading the elements only when no refine precedes it.
    ids: z
      .array(bodyId('contents entry'), { error: 'Send the list of contents entry IDs to reorder' })
      .max(orderLimit, `At most ${orderLimit} contents entries can be reordered at once`)
      .refine((value) => value.length >= 1, 'Send the list of contents entry IDs to reorder')
      .refine((ids) => new Set(ids).size === ids.length, 'Contents entry IDs are duplicated'),
  },
  asObject,
);

// A pasted table of contents (#23): entries in reading order, each one level deeper than the
// entry it belongs to at most. Kept flat so validating deep input needs no recursion.
export const bulkLimits = { entries: 500, levels: 10 } as const;
const bulkInput = z.object(
  {
    // .max() first, as in orderInput.
    entries: z
      .array(
        z.object(
          {
            level: z
              .number(missingOrInvalid('Send the contents level', 'The contents level is invalid'))
              .int('The contents level is invalid')
              .min(0, 'The contents level is invalid')
              .max(bulkLimits.levels - 1, `Contents can have at most ${bulkLimits.levels} levels`),
            ...entryFields,
          },
          asObject,
        ),
        { error: 'Send the list of contents entries to add' },
      )
      .max(
        bulkLimits.entries,
        `At most ${bulkLimits.entries} contents entries can be added at once`,
      )
      .refine((value) => value.length >= 1, 'There are no contents entries to add')
      .superRefine((entries, ctx) => {
        if (entries.length && entries[0].level !== 0)
          ctx.addIssue({
            code: 'custom',
            message: 'The first contents entry must be at the top level',
          });
        const skipped = entries.findIndex((e, i) => i > 0 && e.level > entries[i - 1].level + 1);
        if (skipped > 0)
          ctx.addIssue({
            code: 'custom',
            message: `Contents entry ${skipped + 1} is two or more levels deeper than the one above`,
          });
      }),
  },
  asObject,
);

type Entry = { id: number; parentId: number | null; number: string; title: string };
type Node = Entry & { children: Node[] };

const columns = 'id, parent_id AS "parentId", number, title';

const textbookNotFound = { error: 'Textbook not found' };
const contentNotFound = { error: 'Contents entry not found' };

// Rows come ordered by (parent, position), so each parent's children are appended in order.
async function loadTree(db: Pool | PoolClient, textbookId: number) {
  const { rows } = await db.query<Entry>(
    `SELECT ${columns} FROM textbook_contents WHERE textbook_id = $1
     ORDER BY parent_id NULLS FIRST, position`,
    [textbookId],
  );
  const nodes = new Map(rows.map((row) => [row.id, { ...row, children: [] as Node[] }]));
  const roots: Node[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    if (row.parentId === null) roots.push(node);
    else nodes.get(row.parentId)?.children.push(node);
  }
  return roots;
}

type Reply = { status: number; body?: unknown };

// Every change to a textbook's contents runs in one transaction holding the textbook row lock, so
// concurrent additions, deletions and reorders of the same textbook cannot interleave positions.
// A 4xx reply rolls back.
function writeContents(
  pool: Pool,
  textbookId: number,
  run: (client: PoolClient) => Promise<Reply>,
): Promise<Reply> {
  return inTransaction<Reply>(
    pool,
    async (client) => {
      const { rowCount } = await client.query('SELECT 1 FROM textbooks WHERE id = $1 FOR UPDATE', [
        textbookId,
      ]);
      return rowCount ? run(client) : { status: 404, body: textbookNotFound };
    },
    (reply) => reply.status < 400,
  );
}

const send = (res: Response, reply: Reply) =>
  reply.body === undefined
    ? res.status(reply.status).end()
    : res.status(reply.status).json(reply.body);

export function textbookContentRoutes(pool: Pool) {
  const router = Router({ mergeParams: true });
  const textbookOf = (params: Record<string, string>) => textbookIdParam.parse(params.textbookId);

  router.get('/', async (req, res) => {
    const textbookId = textbookOf(req.params);
    const { rowCount } = await pool.query('SELECT 1 FROM textbooks WHERE id = $1', [textbookId]);
    if (!rowCount) return void res.status(404).json(textbookNotFound);
    res.json({ contents: await loadTree(pool, textbookId) });
  });

  router.post('/', async (req, res) => {
    const textbookId = textbookOf(req.params);
    const entry = createInput.parse(req.body);
    const reply = await writeContents(pool, textbookId, async (client) => {
      if (entry.parentId !== null) {
        const parent = await client.query(
          'SELECT 1 FROM textbook_contents WHERE id = $1 AND textbook_id = $2',
          [entry.parentId, textbookId],
        );
        if (!parent.rowCount)
          return { status: 400, body: { error: 'Parent contents entry not found' } };
      }
      const { rows } = await client.query<Entry>(
        `INSERT INTO textbook_contents (textbook_id, parent_id, position, number, title)
         SELECT $1, $2, COALESCE(MAX(position) + 1, 0), $3, $4 FROM textbook_contents
         WHERE textbook_id = $1 AND parent_id IS NOT DISTINCT FROM $2
         RETURNING ${columns}`,
        [textbookId, entry.parentId, entry.number, entry.title],
      );
      return { status: 201, body: { content: rows[0] } };
    });
    send(res, reply);
  });

  // Adds a whole pasted table of contents after the chapters already there, all or nothing.
  router.post('/bulk', async (req, res) => {
    const textbookId = textbookOf(req.params);
    const { entries } = bulkInput.parse(req.body);
    const reply = await writeContents(pool, textbookId, async (client) => {
      const { rows } = await client.query<{ next: number }>(
        `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM textbook_contents
         WHERE textbook_id = $1 AND parent_id IS NULL`,
        [textbookId],
      );
      // The id of the latest entry at each level, and how many children each parent has so far.
      const path: number[] = [];
      const counts = new Map<number | null, number>([[null, rows[0].next]]);
      for (const entry of entries) {
        const parentId = entry.level === 0 ? null : path[entry.level - 1];
        const position = counts.get(parentId) ?? 0;
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO textbook_contents (textbook_id, parent_id, position, number, title)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [textbookId, parentId, position, entry.number, entry.title],
        );
        counts.set(parentId, position + 1);
        path.length = entry.level;
        path.push(inserted.rows[0].id);
      }
      return { status: 201, body: { contents: await loadTree(client, textbookId) } };
    });
    send(res, reply);
  });

  // Registered before '/:id' so "order" is not read as a content id.
  router.put('/order', async (req, res) => {
    const textbookId = textbookOf(req.params);
    const { parentId, ids } = orderInput.parse(req.body);
    const reply = await writeContents(pool, textbookId, async (client) => {
      const { rows } = await client.query<{ id: number }>(
        `SELECT id FROM textbook_contents
         WHERE textbook_id = $1 AND parent_id IS NOT DISTINCT FROM $2`,
        [textbookId, parentId],
      );
      const siblings = new Set(rows.map((row) => row.id));
      if (siblings.size !== ids.length || ids.some((id) => !siblings.has(id)))
        return {
          status: 400,
          body: { error: 'Send every entry under the same parent exactly once' },
        };
      await client.query(
        `UPDATE textbook_contents AS c SET position = o.ord - 1, updated_at = now()
         FROM unnest($1::bigint[]) WITH ORDINALITY AS o(id, ord)
         WHERE c.id = o.id AND c.position <> o.ord - 1`,
        [ids],
      );
      return { status: 200, body: { contents: await loadTree(client, textbookId) } };
    });
    send(res, reply);
  });

  router.put('/:id', async (req, res) => {
    const textbookId = textbookOf(req.params);
    const id = contentIdParam.parse(req.params.id);
    const entry = updateInput.parse(req.body);
    const { rows } = await pool.query<Entry>(
      `UPDATE textbook_contents SET number = $3, title = $4, updated_at = now()
       WHERE id = $1 AND textbook_id = $2 RETURNING ${columns}`,
      [id, textbookId, entry.number, entry.title],
    );
    if (rows.length === 0) return void res.status(404).json(contentNotFound);
    res.json({ content: rows[0] });
  });

  // Removes the entry with everything below it and closes the gap among its siblings. Study logs
  // and schedules that point to the entry or anything below it block the deletion.
  router.delete('/:id', async (req, res) => {
    const textbookId = textbookOf(req.params);
    const id = contentIdParam.parse(req.params.id);
    const reply = await writeContents(pool, textbookId, async (client) => {
      let rows: { parentId: number | null; position: number }[];
      try {
        ({ rows } = await client.query<{ parentId: number | null; position: number }>(
          `DELETE FROM textbook_contents WHERE id = $1 AND textbook_id = $2
           RETURNING parent_id AS "parentId", position`,
          [id, textbookId],
        ));
      } catch (error) {
        if ((error as { code?: string }).code !== '23503') throw error;
        return {
          status: 409,
          body: {
            error: 'A contents entry with a study log or schedule attached cannot be deleted',
          },
        };
      }
      if (rows.length === 0) return { status: 404, body: contentNotFound };
      await client.query(
        `UPDATE textbook_contents SET position = position - 1
         WHERE textbook_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND position > $3`,
        [textbookId, rows[0].parentId, rows[0].position],
      );
      return { status: 204 };
    });
    send(res, reply);
  });

  return router;
}
