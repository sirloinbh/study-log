import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { monthRange } from '../src/calendar.js';
import { withApi } from './helpers.js';

test('a month runs from its 1st to its last day (#17)', () => {
  assert.deepEqual(monthRange('2026-10'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(monthRange('2026-12'), { from: '2026-12-01', to: '2026-12-31' });
  assert.deepEqual(monthRange('2026-04'), { from: '2026-04-01', to: '2026-04-30' });
});

test('an invalid month is a Korean 400 before touching the DB', async () => {
  const untouchedPool = {
    query: async () => {
      throw new Error('DB must not be queried for invalid input');
    },
  } as unknown as Pool;
  await withApi(untouchedPool, async (call) => {
    for (const month of ['2026-13', '2026-00', '2026-1', '0000-05', 'abc', '2026-10-01']) {
      const { status, data } = await call(`/api/study-logs/calendar?month=${month}`);
      assert.equal(status, 400, month);
      assert.match(String(data.error), /월은 YYYY-MM 형식으로 입력하세요/);
    }
  });
});

test('without a month the calendar shows the month of today in the service time zone', async () => {
  const sent: unknown[][] = [];
  const pool = {
    query: async (_sql: string, params: unknown[]) => {
      sent.push(params);
      return { rows: [] };
    },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/study-logs/calendar');
      assert.equal(status, 200);
      assert.equal(data.month, '2026-11');
      assert.deepEqual(sent[0], ['2026-11-01', '2026-11-30']);
    },
    { today: () => '2026-11-03' },
  );
});
