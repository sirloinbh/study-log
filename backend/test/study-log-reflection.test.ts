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

test('understanding, difficulties and goal answers are checked in Korean before the DB', async () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ ...valid, understanding: 0 }, /이해도는 1~5 사이 정수로 입력하세요/],
    [{ ...valid, understanding: 6 }, /이해도는 1~5 사이 정수로 입력하세요/],
    [{ ...valid, understanding: 3.5 }, /이해도는 1~5 사이 정수로 입력하세요/],
    [{ ...valid, understanding: '4' }, /이해도는 1~5 사이 정수로 입력하세요/],
    [{ ...valid, difficulties: 'x'.repeat(2001) }, /어려웠던 부분은 2000자 이하로 입력하세요/],
    [{ ...valid, difficulties: 3 }, /어려웠던 부분 형식이 올바르지 않습니다/],
    [{ ...valid, goalAchieved: 'yes' }, /목표 달성 여부 형식이 올바르지 않습니다/],
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
      { understanding: 5, difficulties: 'x'.repeat(2000), goalAchieved: true },
      { understanding: null, goalAchieved: null },
    ]) {
      const { status } = await call('/api/study-logs', {
        method: 'POST',
        body: { ...valid, ...extra },
      });
      assert.equal(status, 201, JSON.stringify(extra).slice(0, 80));
    }
  });
  // Parameters 9-11 are understanding, difficulties and goal_achieved.
  assert.deepEqual(
    sent.map((params) => [params[8], (params[9] as string).length, params[10]]),
    [
      [null, 0, null],
      [1, 0, false],
      [5, 2000, true],
      [null, 0, null],
    ],
  );
});
