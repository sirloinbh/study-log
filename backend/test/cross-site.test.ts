import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

// No query may reach the database for a refused request.
const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for a cross-site request');
  },
  connect: async () => {
    throw new Error('DB must not be queried for a cross-site request');
  },
} as unknown as Pool;

const bodylessPosts = [
  '/api/reviews/1/complete',
  '/api/reviews/1/snooze',
  '/api/schedules/1/items/2/complete',
  '/api/schedules/1/items/2/reopen',
];

test('a state-changing request from another site is refused before the database (#333)', async () => {
  await withApi(
    untouchedPool,
    async (call) => {
      for (const site of ['cross-site', 'same-site']) {
        for (const path of bodylessPosts) {
          const { status, data } = await call(path, {
            method: 'POST',
            headers: { 'sec-fetch-site': site },
          });
          assert.equal(status, 403, `${site} ${path}`);
          assert.equal(data.error, 'This request came from another site');
        }
        for (const method of ['PUT', 'PATCH', 'DELETE']) {
          const { status } = await call('/api/keywords/1', {
            method,
            headers: { 'sec-fetch-site': site },
          });
          assert.equal(status, 403, `${site} ${method}`);
        }
      }
    },
    { scheduleCatchUp: false },
  );
});

test('the app itself (same-origin), a script without the header, and reads still work (#333)', async () => {
  const pool = {
    query: async () => ({ rows: [], rowCount: 0 }),
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      // Same-origin and no header both reach the route (here a 404: nothing is stored).
      for (const headers of [{ 'sec-fetch-site': 'same-origin' }, {}] as Record<string, string>[]) {
        const { status } = await call('/api/keywords/1', { method: 'DELETE', headers });
        assert.equal(status, 404, JSON.stringify(headers));
      }
      // A read from another site is not a write.
      const read = await call('/api/health', { headers: { 'sec-fetch-site': 'cross-site' } });
      assert.equal(read.status, 200);
    },
    { scheduleCatchUp: false },
  );
});
