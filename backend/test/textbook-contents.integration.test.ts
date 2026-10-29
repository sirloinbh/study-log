import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Node = {
  id: number;
  parentId: number | null;
  number: string;
  title: string;
  children: Node[];
};

// "1 장|1.1 절" style outline, children in brackets.
const outline = (nodes: Node[]): string =>
  nodes
    .map((n) => `${n.number} ${n.title}${n.children.length ? `[${outline(n.children)}]` : ''}`)
    .join('|');

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'textbook contents keep their hierarchy and sibling order against the real database',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    // A unique title prefix keeps these rows apart from anything else in the test DB.
    const prefix = '[통합테스트 목차]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const newBook = async (title: string) =>
        (
          (await call('/api/textbooks', { method: 'POST', body: { title: `${prefix} ${title}` } }))
            .data.textbook as { id: number }
        ).id;
      const bookId = await newBook('선형대수');
      const path = `/api/textbooks/${bookId}/contents`;
      const add = async (title: string, number: string, parentId?: number) => {
        const { status, data } = await call(path, {
          method: 'POST',
          body: { title, number, parentId },
        });
        assert.equal(status, 201, title);
        return data.content as Node;
      };
      const tree = async () => (await call(path)).data.contents as Node[];

      assert.deepEqual(await tree(), [], 'a new textbook has no contents');

      const ch1 = await add('  벡터  ', '1');
      assert.deepEqual(
        { ...ch1, id: 0 },
        { id: 0, parentId: null, number: '1', title: '벡터' },
        'title is trimmed',
      );
      const ch2 = await add('행렬', '2');
      const s11 = await add('벡터의 덧셈', '1.1', ch1.id);
      await add('내적', '1.2', ch1.id);
      await add('정규 직교', '1.2.1', (await tree())[0].children[1].id);
      assert.equal(
        outline(await tree()),
        '1 벡터[1.1 벡터의 덧셈|1.2 내적[1.2.1 정규 직교]]|2 행렬',
      );

      // Concurrent additions to the same parent each get their own position.
      await Promise.all(['2.1', '2.2', '2.3', '2.4'].map((n) => add(`절 ${n}`, n, ch2.id)));
      const positions = await pool.query(
        'SELECT position FROM textbook_contents WHERE parent_id = $1 ORDER BY position',
        [ch2.id],
      );
      assert.deepEqual(
        positions.rows.map((row) => row.position),
        [0, 1, 2, 3],
      );

      // Reordering sends every sibling once; partial or foreign lists are rejected.
      const ch2Children = (await tree())[1].children.map((n) => n.id);
      const reversed = [...ch2Children].reverse();
      const reordered = await call(`${path}/order`, {
        method: 'PUT',
        body: { parentId: ch2.id, ids: reversed },
      });
      assert.equal(reordered.status, 200);
      assert.deepEqual(
        (reordered.data.contents as Node[])[1].children.map((n) => n.id),
        reversed,
      );
      for (const ids of [reversed.slice(1), [...reversed.slice(1), s11.id]]) {
        const rejected = await call(`${path}/order`, {
          method: 'PUT',
          body: { parentId: ch2.id, ids },
        });
        assert.equal(rejected.status, 400);
        assert.equal(rejected.data.error, '같은 상위 목차의 모든 항목을 한 번씩 보내야 합니다');
      }
      const topLevel = await call(`${path}/order`, {
        method: 'PUT',
        body: { ids: [ch2.id, ch1.id] },
      });
      assert.equal(topLevel.status, 200);
      assert.deepEqual(
        (topLevel.data.contents as Node[]).map((n) => n.title),
        ['행렬', '벡터'],
      );

      const updated = await call(`${path}/${s11.id}`, {
        method: 'PUT',
        body: { number: '1.1', title: '벡터의 합' },
      });
      assert.equal(updated.status, 200);
      assert.equal((updated.data.content as Node).title, '벡터의 합');

      // A parent from another textbook, or a content id of another textbook, is not reachable.
      const otherId = await newBook('미적분');
      const otherPath = `/api/textbooks/${otherId}/contents`;
      const foreign = await call(otherPath, {
        method: 'POST',
        body: { title: '극한', parentId: ch1.id },
      });
      assert.equal(foreign.status, 400);
      assert.equal(foreign.data.error, '상위 목차를 찾을 수 없습니다');
      assert.equal(
        (await call(`${otherPath}/${s11.id}`, { method: 'PUT', body: { title: 'x' } })).status,
        404,
      );
      assert.equal((await call(`${otherPath}/${s11.id}`, { method: 'DELETE' })).status, 404);

      // Deleting removes the subtree and closes the gap among the remaining siblings.
      const ch1Now = (await tree())[1];
      assert.equal(
        (await call(`${path}/${ch1Now.children[0].id}`, { method: 'DELETE' })).status,
        204,
      );
      assert.equal(outline([(await tree())[1]]), '1 벡터[1.2 내적[1.2.1 정규 직교]]');
      const remaining = await pool.query(
        'SELECT position FROM textbook_contents WHERE parent_id = $1',
        [ch1.id],
      );
      assert.deepEqual(
        remaining.rows.map((row) => row.position),
        [0],
      );
      assert.equal((await call(`${path}/${ch1.id}`, { method: 'DELETE' })).status, 204);
      const afterDelete = await tree();
      assert.deepEqual(
        afterDelete.map((n) => n.title),
        ['행렬'],
      );
      assert.deepEqual(
        afterDelete[0].children.map((n) => n.id),
        reversed,
        'the other chapter keeps its order',
      );
      const left = await pool.query(
        'SELECT count(*)::int AS n FROM textbook_contents WHERE textbook_id = $1',
        [bookId],
      );
      assert.equal(left.rows[0].n, 5, 'chapter 2 and its four sections remain');

      // The database itself rejects a cross-textbook parent and a duplicate sibling position.
      await assert.rejects(
        pool.query(
          `INSERT INTO textbook_contents (textbook_id, parent_id, position, title)
           VALUES ($1, $2, 0, 'x')`,
          [otherId, ch2.id],
        ),
        { code: '23503' },
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO textbook_contents (textbook_id, parent_id, position, title)
           VALUES ($1, NULL, 0, 'x')`,
          [bookId],
        ),
        { code: '23505' },
      );

      // Deleting the textbook removes its contents.
      assert.equal((await call(`/api/textbooks/${bookId}`, { method: 'DELETE' })).status, 204);
      const gone = await pool.query(
        'SELECT count(*)::int AS n FROM textbook_contents WHERE textbook_id = $1',
        [bookId],
      );
      assert.equal(gone.rows[0].n, 0);
      assert.equal((await call(path)).status, 404);
    });
  },
);
