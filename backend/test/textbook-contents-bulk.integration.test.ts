import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Node = { id: number; number: string; title: string; children: Node[] };

// "1 장[1.1 절]" style outline, children in brackets.
const outline = (nodes: Node[]): string =>
  nodes
    .map((n) => `${n.number} ${n.title}${n.children.length ? `[${outline(n.children)}]` : ''}`)
    .join('|');

// #23. Requires a dedicated test DB with database/migrations applied. Skipped (not passed)
// without it.
test(
  'a pasted table of contents is added after the existing chapters in one go',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    // A unique title prefix keeps these rows apart from anything else in the test DB.
    const prefix = '[통합테스트 목차 일괄]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const created = await call('/api/textbooks', {
        method: 'POST',
        body: { title: `${prefix} 해석학` },
      });
      const path = `/api/textbooks/${(created.data.textbook as { id: number }).id}/contents`;
      await call(path, { method: 'POST', body: { number: '0', title: '서론' } });

      const bulk = (entries: unknown[]) =>
        call(`${path}/bulk`, { method: 'POST', body: { entries } });
      const saved = await bulk([
        { level: 0, number: '1', title: ' 수열 ' },
        { level: 1, number: '1.1', title: '수렴' },
        { level: 2, number: '', title: '코시 수열' },
        { level: 1, number: '1.2', title: '발산' },
        { level: 0, number: '2', title: '급수' },
        { level: 1, number: '2.1', title: '판정법' },
      ]);
      assert.equal(saved.status, 201);
      const expected = '0 서론|1 수열[1.1 수렴[ 코시 수열]|1.2 발산]|2 급수[2.1 판정법]';
      assert.equal(outline(saved.data.contents as Node[]), expected);
      assert.equal(outline((await call(path)).data.contents as Node[]), expected);

      // Positions run 0, 1, 2 among the siblings of each parent, after what was there.
      const { rows } = await pool.query(
        `SELECT c.title, c.position, p.title AS parent FROM textbook_contents c
         LEFT JOIN textbook_contents p ON p.id = c.parent_id
         WHERE c.textbook_id = $1 ORDER BY c.id`,
        [path.split('/')[3]],
      );
      assert.deepEqual(
        rows.map((r) => `${r.parent ?? '-'}/${r.position}/${r.title}`),
        [
          '-/0/서론',
          '-/1/수열',
          '수열/0/수렴',
          '수렴/0/코시 수열',
          '수열/1/발산',
          '-/2/급수',
          '급수/0/판정법',
        ],
      );

      // A second paste goes after the first.
      assert.equal((await bulk([{ level: 0, number: '3', title: '연속' }])).status, 201);
      assert.match(
        outline((await call(path)).data.contents as Node[]),
        /\|2 급수\[2\.1 판정법\]\|3 연속$/,
      );

      // An invalid batch adds nothing.
      assert.equal(
        (
          await bulk([
            { level: 0, title: '함수' },
            { level: 2, title: 'x' },
          ])
        ).status,
        400,
      );
      assert.doesNotMatch(outline((await call(path)).data.contents as Node[]), /함수/);
    });
  },
);
