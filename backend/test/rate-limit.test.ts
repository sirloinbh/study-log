import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const counting = () => {
  const counter = { queries: 0 };
  const pool = {
    query: async () => {
      counter.queries++;
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  return { pool, counter };
};

test('requests over the limit get a Korean 429 and never reach the database', async () => {
  const { pool, counter } = counting();
  await withApi(
    pool,
    async (call) => {
      assert.equal((await call('/api/keywords')).status, 200);
      assert.equal((await call('/api/keywords')).status, 200);
      const refused = await call('/api/keywords');
      assert.equal(refused.status, 429);
      assert.equal(refused.data.error, '요청이 너무 많습니다. 잠시 뒤 다시 시도하세요');
    },
    { requestsPerMinute: 2 },
  );
  assert.equal(counter.queries, 2);
});

test('a refused request is not parsed, so a bad body still answers 429', async () => {
  const { pool } = counting();
  await withApi(
    pool,
    async (call) => {
      await call('/api/keywords');
      const refused = await call('/api/keywords', { method: 'POST', rawBody: '{broken' });
      assert.equal(refused.status, 429);
    },
    { requestsPerMinute: 1 },
  );
});

test('health is neither counted nor refused, so busy pages cannot make the API look down', async () => {
  const { pool } = counting();
  await withApi(
    pool,
    async (call) => {
      for (let i = 0; i < 3; i++) assert.equal((await call('/api/health')).status, 200);
      assert.equal((await call('/api/keywords')).status, 200);
      assert.equal((await call('/api/keywords')).status, 429);
      assert.equal((await call('/api/health')).status, 200);
    },
    { requestsPerMinute: 1 },
  );
});

test('forged forwarded headers neither get around the limit nor write to the log', async () => {
  const { pool } = counting();
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    await withApi(
      pool,
      async (call) => {
        const forged = (address: string) => ({
          headers: { 'x-forwarded-for': address, forwarded: `for=${address}` },
        });
        assert.equal((await call('/api/keywords', forged('1.2.3.4'))).status, 200);
        assert.equal((await call('/api/keywords', forged('5.6.7.8'))).status, 429);
      },
      { requestsPerMinute: 1 },
    );
  } finally {
    console.error = original;
  }
  assert.deepEqual(logged, []);
});

test('the default limit leaves room for a page opening many requests at once', async () => {
  const { pool } = counting();
  await withApi(pool, async (call) => {
    const answers = await Promise.all(Array.from({ length: 100 }, () => call('/api/keywords')));
    assert.deepEqual([...new Set(answers.map((answer) => answer.status))], [200]);
  });
});
