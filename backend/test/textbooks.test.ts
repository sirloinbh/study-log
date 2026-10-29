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

test('invalid textbooks are rejected with Korean messages before touching the DB', async () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ author: 'Strang' }, /제목을 입력하세요/],
    [{ title: '   ' }, /제목을 입력하세요/],
    [{ title: 'a'.repeat(201) }, /제목 길이는 200자 이하/],
    [{ title: 'Linear Algebra', author: 7 }, /저자 형식이 올바르지 않습니다/],
    [{ title: 'Linear Algebra', edition: 'x'.repeat(51) }, /판본 길이는 50자 이하/],
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

test('textbook bodies that are not a JSON object are rejected in Korean before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const init of [
      { method: 'POST' },
      { method: 'POST', body: [{ title: '선형대수' }] },
      { method: 'PUT', body: [{ title: '선형대수' }] },
    ]) {
      const path = init.method === 'PUT' ? '/api/textbooks/1' : '/api/textbooks';
      const { status, data } = await call(path, init);
      assert.equal(status, 400, JSON.stringify(init));
      assert.equal(data.error, '교재 내용을 JSON 객체로 보내세요');
    }
    const malformed = await call('/api/textbooks', { method: 'POST', rawBody: '{"title":' });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.data.error, '요청 본문의 JSON 형식이 올바르지 않습니다');
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
        assert.match(String(data.error), /교재 ID가 올바르지 않습니다/);
      }
    }
  });
});

test('missing textbooks answer a Korean 404 for read, update and delete', async () => {
  await withApi(emptyPool, async (call) => {
    for (const init of [{}, { method: 'PUT', body: { title: '미적분학' } }, { method: 'DELETE' }]) {
      const { status, data } = await call('/api/textbooks/999', init);
      assert.equal(status, 404);
      assert.equal(data.error, '교재를 찾을 수 없습니다');
    }
  });
});

// #58: PostgreSQL refuses a NUL character in text as an invalid byte sequence (22021).
test('a NUL character in the input is a Korean 400, not a logged server error', async () => {
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
      assert.equal(data.error, '입력에 사용할 수 없는 문자(NUL)가 있습니다');
    });
  } finally {
    console.error = original;
  }
  assert.deepEqual(logged, []);
});
