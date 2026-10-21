import { test } from 'node:test';
import assert from 'node:assert/strict';
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
      const { status, data } = await call('/api/textbooks', { method: 'POST', body });
      assert.equal(status, 400, JSON.stringify(body));
      assert.match(String(data.error), message);
    }
    const { status, data } = await call('/api/textbooks/0');
    assert.equal(status, 400);
    assert.match(String(data.error), /교재 ID가 올바르지 않습니다/);
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
