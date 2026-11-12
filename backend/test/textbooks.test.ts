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

test('invalid textbooks are rejected with English messages before touching the DB', async () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ author: 'Strang' }, /Enter the title/],
    [{ title: '   ' }, /Enter the title/],
    [{ title: 'a'.repeat(201) }, /title must be at most 200 characters/],
    [{ title: 'Linear Algebra', author: 7 }, /author format is invalid/],
    [{ title: 'Linear Algebra', edition: 'x'.repeat(51) }, /edition must be at most 50 characters/],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [body, message] of cases) {
      for (const [method, path] of [
        ['POST', '/api/textbooks'],
        ['PUT', '/api/textbooks/1'],
      ]) {
        const { status, data } = await call(path, { method, body });
        assert.equal(status, 400, `${method} ${JSON.stringify(body)}`);
        assert.match(String(data.error), message);
      }
    }
  });
});

test('textbook bodies that are not a JSON object are rejected in English before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const init of [
      { method: 'POST' },
      { method: 'POST', body: [{ title: '선형대수' }] },
      { method: 'PUT', body: [{ title: '선형대수' }] },
    ]) {
      const path = init.method === 'PUT' ? '/api/textbooks/1' : '/api/textbooks';
      const { status, data } = await call(path, init);
      assert.equal(status, 400, JSON.stringify(init));
      assert.equal(data.error, 'Send the textbook as a JSON object');
    }
    const malformed = await call('/api/textbooks', { method: 'POST', rawBody: '{"title":' });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.data.error, 'Request body is not valid JSON');
  });
});

test('textbook ids that are not plain positive integers are rejected before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const id of ['0', '-1', '1.5', '1e3', '0x10', '01', '99999999999999999999']) {
      for (const init of [
        {},
        { method: 'PUT', body: { title: '미적분학' } },
        { method: 'DELETE' },
      ]) {
        const { status, data } = await call(`/api/textbooks/${id}`, init);
        assert.equal(status, 400, `${id} ${JSON.stringify(init)}`);
        assert.match(String(data.error), /Invalid textbook ID/);
      }
    }
  });
});

test('missing textbooks answer an English 404 for read, update and delete', async () => {
  await withApi(emptyPool, async (call) => {
    for (const init of [{}, { method: 'PUT', body: { title: '미적분학' } }, { method: 'DELETE' }]) {
      const { status, data } = await call('/api/textbooks/999', init);
      assert.equal(status, 404);
      assert.equal(data.error, 'Textbook not found');
    }
  });
});

// #58: PostgreSQL refuses a NUL character in text as an invalid byte sequence (22021).
test('a NUL character in the input is an English 400, not a logged server error', async () => {
  const nulPool = {
    query: async () => {
      throw Object.assign(new Error('invalid byte sequence for encoding "UTF8": 0x00'), {
        code: '22021',
      });
    },
    connect: async () => ({
      query: async (sql: string) => {
        if (/^(BEGIN|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 };
        throw Object.assign(new Error('invalid byte sequence for encoding "UTF8": 0x00'), {
          code: '22021',
        });
      },
      release: () => {},
    }),
  } as unknown as Pool;
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    await withApi(nulPool, async (call) => {
      const { status, data } = await call('/api/textbooks', {
        method: 'POST',
        body: { title: 'a\u0000b' },
      });
      assert.equal(status, 400);
      assert.equal(data.error, 'Input contains a character that is not allowed (NUL)');
    });
  } finally {
    console.error = original;
  }
  assert.deepEqual(logged, []);
});
