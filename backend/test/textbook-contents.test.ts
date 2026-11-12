import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

// Validation must reject input before any query reaches the database.
const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
  connect: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;

// No textbook exists; records which statements a write transaction ran.
function missingTextbookPool() {
  const statements: string[] = [];
  let released = 0;
  const query = async (sql: string) => {
    statements.push(sql.split(/\s+/)[0]);
    return { rows: [], rowCount: 0 };
  };
  const pool = { query, connect: async () => ({ query, release: () => released++ }) };
  return { pool: pool as unknown as Pool, statements, released: () => released };
}

const base = '/api/textbooks/1/contents';

test('invalid contents are rejected with English messages before touching the DB', async () => {
  const cases: [string, string, unknown, RegExp][] = [
    ['POST', base, { number: '1' }, /Enter the contents title/],
    ['POST', base, { title: '   ' }, /Enter the contents title/],
    ['POST', base, { title: 'a'.repeat(201) }, /contents title must be at most 200 characters/],
    [
      'POST',
      base,
      { title: '행렬', number: 'x'.repeat(21) },
      /number must be at most 20 characters/,
    ],
    ['POST', base, { title: '행렬', number: 3 }, /The number format is invalid/],
    ['POST', base, { title: '행렬', parentId: 0 }, /Invalid parent contents entry ID/],
    ['POST', base, { title: '행렬', parentId: '2' }, /Invalid parent contents entry ID/],
    ['POST', base, { title: '행렬', parentId: 1.5 }, /Invalid parent contents entry ID/],
    ['POST', base, [{ title: '행렬' }], /Send the contents entry as a JSON object/],
    ['PUT', `${base}/1`, { title: '' }, /Enter the contents title/],
    ['PUT', `${base}/order`, {}, /Send the list of contents entry IDs to reorder/],
    ['PUT', `${base}/order`, { ids: [] }, /Send the list of contents entry IDs to reorder/],
    ['PUT', `${base}/order`, { ids: [1, 2, 1] }, /Contents entry IDs are duplicated/],
    ['PUT', `${base}/order`, { ids: [1, -2] }, /Invalid contents entry ID/],
    // A pasted table of contents (#23).
    ['POST', `${base}/bulk`, {}, /Send the list of contents entries to add/],
    ['POST', `${base}/bulk`, { entries: [] }, /There are no contents entries to add/],
    ['POST', `${base}/bulk`, { entries: [{ title: '벡터' }] }, /Send the contents level/],
    [
      'POST',
      `${base}/bulk`,
      { entries: [{ level: 1, title: '벡터' }] },
      /first contents entry must be at the top level/,
    ],
    [
      'POST',
      `${base}/bulk`,
      {
        entries: [
          { level: 0, title: '벡터' },
          { level: 2, title: '내적' },
        ],
      },
      /Contents entry 2 is two or more levels deeper/,
    ],
    ['POST', `${base}/bulk`, { entries: [{ level: 10, title: '깊음' }] }, /at most 10 levels/],
    [
      'POST',
      `${base}/bulk`,
      { entries: [{ level: 0.5, title: '벡터' }] },
      /contents level is invalid/,
    ],
    ['POST', `${base}/bulk`, { entries: [{ level: 0, title: ' ' }] }, /Enter the contents title/],
    [
      'POST',
      `${base}/bulk`,
      { entries: Array.from({ length: 501 }, () => ({ level: 0, title: '장' })) },
      /At most 500 contents entries can be added at once/,
    ],
    [
      'PUT',
      `${base}/order`,
      { ids: Array.from({ length: 1001 }, (_, i) => i + 1) },
      /At most 1000 contents entries can be reordered at once/,
    ],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [method, path, body, message] of cases) {
      const { status, data } = await call(path, { method, body });
      assert.equal(status, 400, `${method} ${path} ${JSON.stringify(body)}`);
      assert.match(String(data.error), message);
    }
  });
});

test('textbook and content ids in the path are checked before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const id of ['0', '1e3', '01', '99999999999999999999']) {
      for (const [method, body] of [
        ['GET', undefined],
        ['POST', { title: '행렬' }],
        ['PUT', { ids: [1] }],
      ] as const) {
        const path =
          method === 'PUT'
            ? `/api/textbooks/${id}/contents/order`
            : `/api/textbooks/${id}/contents`;
        const { status, data } = await call(path, { method, body });
        assert.equal(status, 400, `${method} ${id}`);
        assert.match(String(data.error), /Invalid textbook ID/);
      }
      for (const init of [{ method: 'PUT', body: { title: '행렬' } }, { method: 'DELETE' }]) {
        const { status, data } = await call(`${base}/${id}`, init);
        assert.equal(status, 400, `${init.method} content ${id}`);
        assert.match(String(data.error), /Invalid contents entry ID/);
      }
    }
  });
});

test('contents of a missing textbook answer an English 404 and writes roll back', async () => {
  const { pool, statements, released } = missingTextbookPool();
  await withApi(pool, async (call) => {
    for (const [path, init] of [
      [base, {}],
      [base, { method: 'POST', body: { title: '행렬' } }],
      [`${base}/order`, { method: 'PUT', body: { ids: [1] } }],
      [`${base}/bulk`, { method: 'POST', body: { entries: [{ level: 0, title: '행렬' }] } }],
      [`${base}/1`, { method: 'DELETE' }],
    ] as const) {
      const { status, data } = await call(path, init);
      assert.equal(status, 404, JSON.stringify(init));
      assert.equal(data.error, 'Textbook not found');
    }
    const updated = await call(`${base}/1`, { method: 'PUT', body: { title: '행렬' } });
    assert.equal(updated.status, 404);
    assert.equal(updated.data.error, 'Contents entry not found');
  });
  // Four write transactions: each locks the textbook, finds nothing and rolls back.
  assert.equal(statements.filter((sql) => sql === 'ROLLBACK').length, 4);
  assert.equal(statements.filter((sql) => sql === 'COMMIT').length, 0);
  assert.equal(released(), 4);
});

// #68: a failed transaction whose ROLLBACK also fails (a dropped connection) must destroy the
// client instead of returning the broken connection to the pool.
function failingPool(rollbackFails: boolean) {
  const releases: unknown[][] = [];
  const query = async (sql: string) => {
    if (sql.startsWith('BEGIN')) return { rows: [], rowCount: 0 };
    if (sql.startsWith('ROLLBACK')) {
      if (rollbackFails) throw new Error('Connection terminated unexpectedly');
      return { rows: [], rowCount: 0 };
    }
    throw new Error('Connection terminated unexpectedly');
  };
  const pool = {
    query,
    connect: async () => ({ query, release: (...args: unknown[]) => void releases.push(args) }),
  };
  return { pool: pool as unknown as Pool, releases };
}

test('a client whose ROLLBACK fails is destroyed, not returned to the pool', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    for (const rollbackFails of [true, false]) {
      const { pool, releases } = failingPool(rollbackFails);
      await withApi(pool, async (call) => {
        const { status } = await call(base, { method: 'POST', body: { title: '행렬' } });
        assert.equal(status, 500);
      });
      assert.equal(releases.length, 1, 'released once');
      const [reason] = releases[0];
      if (rollbackFails) {
        assert.ok(reason instanceof Error, 'released with the rollback error, so pg destroys it');
        assert.match(reason.message, /Connection terminated/);
      } else {
        assert.equal(reason, undefined, 'a clean rollback returns the client to the pool');
      }
    }
  } finally {
    console.error = original;
  }
});
