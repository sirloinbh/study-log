import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

// Validation must reject input before any query reaches the database.
const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;
const emptyPool = { query: async () => ({ rows: [], rowCount: 0 }) } as unknown as Pool;

test('invalid keywords are rejected with English messages before touching the DB', async () => {
  const cases: [unknown, RegExp][] = [
    [{}, /Enter a keyword/],
    [{ keyword: '  ' }, /Enter a keyword/],
    [{ keyword: 3 }, /The keyword format is invalid/],
    [{ keyword: 'x'.repeat(51) }, /The keyword must be at most 50 characters/],
    [{ keyword: '고유값\n고유벡터' }, /The keyword must be on one line/],
    [{ keyword: '고유값', memo: 'x'.repeat(2001) }, /The memo must be at most 2000 characters/],
    [{ keyword: '고유값', date: '2026/10/23' }, /The date must be in YYYY-MM-DD format/],
    [{ keyword: '고유값', date: '2026-02-30' }, /This date does not exist/],
    // A JS date but not a PostgreSQL one: must be a 400, not a database error.
    [{ keyword: '고유값', date: '0000-01-01' }, /This date does not exist/],
    [['고유값'], /Send the keyword as a JSON object/],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [body, message] of cases) {
      for (const [method, path] of [
        ['POST', '/api/keywords'],
        ['PUT', '/api/keywords/1'],
      ]) {
        const { status, data } = await call(path, { method, body });
        assert.equal(status, 400, `${method} ${JSON.stringify(body).slice(0, 60)}`);
        assert.match(String(data.error), message);
      }
    }
  });
});

test('list filters and ids are checked before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const [path, message] of [
      ['/api/keywords?date=2026-13-01', /This date does not exist/],
      ['/api/keywords?date=0000-01-01', /This date does not exist/],
      ['/api/keywords?q=' + 'x'.repeat(51), /The search term must be at most 50 characters/],
      [
        '/api/keywords?from=2026-10-23&to=2026-10-01',
        /The start date cannot be after the end date/,
      ],
      ['/api/keywords?limit=0', /The limit must be at least 1/],
      ['/api/keywords?limit=201', /The limit must be at most 200/],
      ['/api/keywords/01', /Invalid keyword ID/],
    ] as const) {
      const { status, data } = await call(path);
      assert.equal(status, 400, path);
      assert.match(String(data.error), message);
    }
  });
});

test('a missing keyword answers an English 404 and a duplicate an English 409', async () => {
  await withApi(emptyPool, async (call) => {
    for (const init of [{}, { method: 'PUT', body: { keyword: '행렬' } }, { method: 'DELETE' }]) {
      const { status, data } = await call('/api/keywords/9', init);
      assert.equal(status, 404, JSON.stringify(init));
      assert.equal(data.error, 'Keyword not found');
    }
  });
  const duplicatePool = {
    query: async () => {
      throw Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'keywords_date_keyword_key',
      });
    },
  } as unknown as Pool;
  await withApi(duplicatePool, async (call) => {
    for (const [method, path] of [
      ['POST', '/api/keywords'],
      ['PUT', '/api/keywords/1'],
    ]) {
      const { status, data } = await call(path, { method, body: { keyword: '행렬' } });
      assert.equal(status, 409, method);
      assert.equal(data.error, 'This keyword already exists on this date');
    }
  });
});

test('a keyword without a date is saved for today in the service time zone', async () => {
  const sent: unknown[][] = [];
  const pool = {
    query: async (_sql: string, params: unknown[]) => {
      sent.push(params);
      return { rows: [{}], rowCount: 1 };
    },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const added = await call('/api/keywords', { method: 'POST', body: { keyword: ' 고유값 ' } });
      assert.equal(added.status, 201);
      assert.deepEqual(sent[0], ['2026-10-23', '고유값', '']);
      await call('/api/keywords', {
        method: 'POST',
        body: { keyword: '대각화', date: '2026-10-01', memo: '메모' },
      });
      assert.deepEqual(sent[1], ['2026-10-01', '대각화', '메모']);
    },
    { today: () => '2026-10-23' },
  );
});

test('search wildcards are matched as plain characters', async () => {
  const sent: unknown[][] = [];
  const pool = {
    query: async (_sql: string, params: unknown[]) => {
      sent.push(params);
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    await call('/api/keywords?q=' + encodeURIComponent(' 50%_\\ '));
    assert.deepEqual(sent[0], ['%50\\%\\_\\\\%', 50]);
  });
});
