import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;

test('invalid flashcard requests are rejected with English messages before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    const list = await call('/api/flashcards?date=2026/10/23');
    assert.equal(list.status, 400);
    assert.match(String(list.data.error), /The date must be in YYYY-MM-DD format/);

    const cases: [unknown, RegExp][] = [
      [{}, /Send known as true or false/],
      [{ known: 'yes' }, /Send known as true or false/],
      [{ known: true, date: '2026-02-30' }, /This date does not exist/],
      [['x'], /Send the answer as a JSON object/],
    ];
    for (const [body, message] of cases) {
      const { status, data } = await call('/api/flashcards/1', { method: 'PUT', body });
      assert.equal(status, 400, JSON.stringify(body));
      assert.match(String(data.error), message);
    }
    assert.equal(
      (await call('/api/flashcards/abc', { method: 'PUT', body: { known: true } })).status,
      400,
    );
  });
});
