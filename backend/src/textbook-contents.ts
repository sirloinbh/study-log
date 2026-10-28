import { Router, type Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

// Same rule as the textbook id: plain positive integers that stay exact in JS and fit bigint.
const pathId = (label: string) =>
  z
    .string()
    .regex(/^[1-9]\d{0,14}$/, `${label} ID가 올바르지 않습니다`)
    .transform(Number);
const textbookIdParam = pathId('교재');
const contentIdParam = pathId('목차');

const bodyId = (label: string) => {
  const message = `${label} ID가 올바르지 않습니다`;
  return z
    .number({ required_error: message, invalid_type_error: message })
    .int(message)
    .min(1, message)
    .max(999_999_999_999_999, message);
};

const asObject = {
  required_error: '목차 내용을 JSON 객체로 보내세요',
  invalid_type_error: '목차 내용을 JSON 객체로 보내세요',
};

const entryFields = {
  number: z
    .string({ invalid_type_error: '번호 형식이 올바르지 않습니다' })
    .trim()
    .max(20, '번호 길이는 20자 이하여야 합니다')
    .default(''),
  title: z
    .string({
      required_error: '목차 제목을 입력하세요',
      invalid_type_error: '목차 제목 형식이 올바르지 않습니다',
    })
    .trim()
    .min(1, '목차 제목을 입력하세요')
    .max(200, '목차 제목 길이는 200자 이하여야 합니다'),
};

// A new entry goes last among its siblings; no parent means a top-level chapter.
const createInput = z.object(
  { parentId: bodyId('상위 목차').nullable().default(null), ...entryFields },
  asObject,
);
const updateInput = z.object(entryFields, asObject);
// A length limit keeps one oversized request from raising an issue per element
// (zod 3 advisory GHSA-mrhx-c7xc-m3w5, sirloinbh/project-standards#326).
export const orderLimit = 1000;
const orderInput = z.object(
  {
    parentId: bodyId('상위 목차').nullable().default(null),
    ids: z
      .array(bodyId('목차'), {
        required_error: '순서를 바꿀 목차 ID 목록을 보내세요',
        invalid_type_error: '순서를 바꿀 목차 ID 목록을 보내세요',
      })
      .min(1, '순서를 바꿀 목차 ID 목록을 보내세요')
      .max(orderLimit, `목차 순서는 한 번에 ${orderLimit}개까지 바꿀 수 있습니다`)
      .refine((ids) => new Set(ids).size === ids.length, '목차 ID가 중복되었습니다'),
  },
  asObject,
);

// A pasted table of contents (#23): entries in reading order, each one level deeper than the
// entry it belongs to at most. Kept flat so validating deep input needs no recursion.
export const bulkLimits = { entries: 500, levels: 10 } as const;
const bulkInput = z.object(
  {
    entries: z
      .array(
        z.object(
          {
            level: z
              .number({
                required_error: '목차 단계를 보내세요',
                invalid_type_error: '목차 단계가 올바르지 않습니다',
              })
              .int('목차 단계가 올바르지 않습니다')
              .min(0, '목차 단계가 올바르지 않습니다')
              .max(bulkLimits.levels - 1, `목차는 ${bulkLimits.levels}단계까지입니다`),
            ...entryFields,
          },
          asObject,
        ),
        {
          required_error: '등록할 목차 목록을 보내세요',
          invalid_type_error: '등록할 목차 목록을 보내세요',
        },
      )
      .min(1, '등록할 목차가 없습니다')
      .max(bulkLimits.entries, `목차는 한 번에 ${bulkLimits.entries}개까지 등록할 수 있습니다`)
      .superRefine((entries, ctx) => {
        if (entries.length && entries[0].level !== 0)
          ctx.addIssue({ code: 'custom', message: '첫 목차는 맨 위 단계여야 합니다' });
        const skipped = entries.findIndex((e, i) => i > 0 && e.level > entries[i - 1].level + 1);
        if (skipped > 0)
          ctx.addIssue({
            code: 'custom',
            message: `${skipped + 1}번째 목차가 위 목차보다 두 단계 이상 깊습니다`,
          });
      }),
  },
  asObject,
);

type Entry = { id: number; parentId: number | null; number: string; title: string };
type Node = Entry & { children: Node[] };

const columns = 'id, parent_id AS "parentId", number, title';

const textbookNotFound = { error: '교재를 찾을 수 없습니다' };
const contentNotFound = { error: '목차를 찾을 수 없습니다' };

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
async function writeContents(
  pool: Pool,
  textbookId: number,
  run: (client: PoolClient) => Promise<Reply>,
): Promise<Reply> {
  const client = await pool.connect();
  // Set when even ROLLBACK fails (a dropped connection): the client is then destroyed instead of
  // going back to the pool, where the next request would get the broken connection (#68).
  let broken: Error | undefined;
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query('SELECT 1 FROM textbooks WHERE id = $1 FOR UPDATE', [
      textbookId,
    ]);
    const reply = rowCount ? await run(client) : { status: 404, body: textbookNotFound };
    await client.query(reply.status < 400 ? 'COMMIT' : 'ROLLBACK');
    return reply;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      broken = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
    }
    throw error;
  } finally {
    client.release(broken);
  }
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
          return { status: 400, body: { error: '상위 목차를 찾을 수 없습니다' } };
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
          body: { error: '같은 상위 목차의 모든 항목을 한 번씩 보내야 합니다' },
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
  // that point to the entry or anything below it block the deletion.
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
        return { status: 409, body: { error: '학습 기록이 연결된 목차는 삭제할 수 없습니다' } };
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
