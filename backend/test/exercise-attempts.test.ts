import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

// Validation must reject an attempt before any query reaches the database (#356).
const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;

test('invalid attempts are rejected with English messages before touching the DB (#356)', async () => {
  const cases: [unknown, RegExp][] = [
    [{}, /Choose whether the answer was correct or wrong/],
    [{ result: 'maybe' }, /The result must be correct or wrong/],
    [{ result: 'wrong', hintUsed: 'yes' }, /The hint flag format is invalid/],
    [{ result: 'wrong', date: '2026-13-01' }, /does not exist|YYYY-MM-DD/],
    [{ result: 'wrong', date: 5 }, /The attempt date format is invalid/],
    [{ result: 'wrong', note: 'x'.repeat(2001) }, /at most 2000 characters/],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [body, message] of cases) {
      const { status, data } = await call('/api/exercises/1/attempts', { method: 'POST', body });
      assert.equal(status, 400, JSON.stringify(body));
      assert.match(String(data.error), message);
    }
    for (const path of ['/api/exercises/0/attempts', '/api/exercise-attempts/abc']) {
      const { status } = await call(path, { method: path.includes('abc') ? 'DELETE' : 'GET' });
      assert.equal(status, 400, path);
    }
  });
});

test('an attempt is saved with today as its default date (#356)', async () => {
  const seen: unknown[][] = [];
  const answer = async (sql: string, values?: unknown[]) => {
    if (sql.startsWith('INSERT INTO exercise_attempts')) {
      seen.push(values ?? []);
      return { rows: [{ id: 5 }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  const pool = {
    query: answer,
    connect: async () => ({ query: answer, release: () => undefined }),
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const created = await call('/api/exercises/3/attempts', {
        method: 'POST',
        body: { result: 'wrong', hintUsed: true, note: ' stuck on (b) ' },
      });
      assert.equal(created.status, 201);
      assert.deepEqual(seen[0], [3, '2026-11-23', 'wrong', true, 'stuck on (b)']);
      await call('/api/exercises/3/attempts', {
        method: 'POST',
        body: { result: 'correct', date: '2026-11-01' },
      });
      assert.deepEqual(seen[1], [3, '2026-11-01', 'correct', false, '']);
    },
    { today: () => '2026-11-23' },
  );
});
