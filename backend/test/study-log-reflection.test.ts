import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;

const valid = { studyDate: '2026-10-21', startTime: '09:00', endTime: '10:30' };

test('understanding and goal answers are checked in English before the DB', async () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ ...valid, understanding: 0 }, /Understanding must be a whole number from 1 to 5/],
    [{ ...valid, understanding: 6 }, /Understanding must be a whole number from 1 to 5/],
    [{ ...valid, understanding: 3.5 }, /Understanding must be a whole number from 1 to 5/],
    [{ ...valid, understanding: '4' }, /Understanding must be a whole number from 1 to 5/],
    [{ ...valid, goalAchieved: 'yes' }, /The goal-achieved flag format is invalid/],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [body, message] of cases) {
      for (const [method, path] of [
        ['POST', '/api/study-logs'],
        ['PUT', '/api/study-logs/1'],
      ]) {
        const { status, data } = await call(path, { method, body });
        assert.equal(status, 400, `${method} ${JSON.stringify(body).slice(0, 80)}`);
        assert.match(String(data.error), message);
      }
    }
  });
});

test('the answers are optional and the edges of the scale are accepted', async () => {
  const sent: unknown[][] = [];
  const pool = {
    connect: async () => ({
      // BEGIN and COMMIT carry no parameters.
      query: async (_sql: string, params?: unknown[]) => {
        if (params) sent.push(params);
        return { rows: [{}], rowCount: 1 };
      },
      release: () => {},
    }),
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    for (const extra of [
      {},
      { understanding: 1, goalAchieved: false },
      { understanding: 5, goalAchieved: true },
      { understanding: null, goalAchieved: null },
    ]) {
      const { status } = await call('/api/study-logs', {
        method: 'POST',
        body: { ...valid, ...extra },
      });
      assert.equal(status, 201, JSON.stringify(extra).slice(0, 80));
    }
  });
  // Parameters 9 and 10 are understanding and goal_achieved.
  assert.deepEqual(
    sent.map((params) => [params[8], params[9]]),
    [
      [null, null],
      [1, false],
      [5, true],
      [null, null],
    ],
  );
});
