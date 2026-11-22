import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { serviceDate } from '../src/standard/http.js';
import { withApi } from './helpers.js';

const pool = (query: () => Promise<unknown>) => ({ query }) as unknown as Pool;

test('health reports the service and the injected service date when the DB answers', async () => {
  await withApi(
    pool(async () => ({ rows: [] })),
    async (call) => {
      const { status, data } = await call('/api/health');
      assert.equal(status, 200);
      assert.deepEqual(data, { ok: true, service: 'study-log', today: '2026-10-19' });
    },
    { today: () => '2026-10-19' },
  );
});

test('a DB failure becomes an English 500 without leaking the error', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    await withApi(
      pool(async () => {
        throw new Error('password authentication failed for user secret');
      }),
      async (call) => {
        const { status, data } = await call('/api/health');
        assert.equal(status, 500);
        assert.deepEqual(data, { error: 'Server error' });
      },
    );
  } finally {
    console.error = original;
  }
});

test('unknown API paths return an English 404 JSON body', async () => {
  await withApi(
    pool(async () => ({ rows: [] })),
    async (call) => {
      const { status, data } = await call('/api/does-not-exist');
      assert.equal(status, 404);
      assert.equal(data.error, 'API not found');
    },
  );
});

test('service date follows Asia/Seoul across the UTC day boundary', () => {
  assert.equal(serviceDate(new Date('2026-10-18T14:59:59Z')), '2026-10-18');
  assert.equal(serviceDate(new Date('2026-10-18T15:00:00Z')), '2026-10-19');
});

test('a 500 log line carries the request ID, time and level (#260)', async () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (line: string) => void lines.push(line);
  try {
    await withApi(
      pool(async () => {
        throw new Error('boom');
      }),
      async (call) => {
        const { status, headers } = await call('/api/health', {
          headers: { 'x-request-id': 'req-260' },
        });
        assert.equal(status, 500);
        assert.equal(headers.get('x-request-id'), 'req-260');
      },
    );
  } finally {
    console.error = original;
  }
  const entry = lines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .find((line) => line.event === 'request_error');
  assert.ok(entry);
  assert.equal(entry.requestId, 'req-260');
  assert.equal(entry.level, 'error');
  assert.equal(typeof entry.time, 'string');
});

test('a malformed path ID is a 400 naming the ID (#260)', async () => {
  await withApi(
    pool(async () => ({ rows: [] })),
    async (call) => {
      const { status, data } = await call('/api/textbooks/abc');
      assert.equal(status, 400);
      assert.deepEqual(data, { error: 'Invalid textbook ID' });
    },
  );
});

test('200 invalid items (the bulk maximum) give a capped validation message (#260)', async () => {
  await withApi(
    pool(async () => ({ rows: [] })),
    async (call) => {
      const exercises = Array.from({ length: 200 }, () => ({ number: '', body: '' }));
      const { status, data } = await call('/api/textbooks/1/contents/1/exercises/bulk', {
        method: 'POST',
        body: { exercises },
      });
      assert.equal(status, 400);
      assert.match(String(data.error), /and \d+ more$/);
      assert.ok(String(data.error).length < 2000);
    },
  );
});
