import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { withApi } from './helpers.js';

// Validation must reject input before any query reaches the database.
const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
  connect: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;

// No textbook exists; records which statements a write transaction ran.
function missingTextbookPool() {
  const statements: string[] = [];
  let released = 0;
  const query = async (sql: string) => {
    statements.push(sql.split(/\s+/)[0]);
    return { rows: [], rowCount: 0 };
  };
  const pool = { query, connect: async () => ({ query, release: () => released++ }) };
  return { pool: pool as unknown as Pool, statements, released: () => released };
}

const base = '/api/textbooks/1/contents';

test('invalid contents are rejected with Korean messages before touching the DB', async () => {
  const cases: [string, string, unknown, RegExp][] = [
    ['POST', base, { number: '1' }, /목차 제목을 입력하세요/],
    ['POST', base, { title: '   ' }, /목차 제목을 입력하세요/],
    ['POST', base, { title: 'a'.repeat(201) }, /목차 제목 길이는 200자 이하/],
    ['POST', base, { title: '행렬', number: 'x'.repeat(21) }, /번호 길이는 20자 이하/],
    ['POST', base, { title: '행렬', number: 3 }, /번호 형식이 올바르지 않습니다/],
    ['POST', base, { title: '행렬', parentId: 0 }, /상위 목차 ID가 올바르지 않습니다/],
    ['POST', base, { title: '행렬', parentId: '2' }, /상위 목차 ID가 올바르지 않습니다/],
    ['POST', base, { title: '행렬', parentId: 1.5 }, /상위 목차 ID가 올바르지 않습니다/],
    ['POST', base, [{ title: '행렬' }], /목차 내용을 JSON 객체로 보내세요/],
    ['PUT', `${base}/1`, { title: '' }, /목차 제목을 입력하세요/],
    ['PUT', `${base}/order`, {}, /순서를 바꿀 목차 ID 목록을 보내세요/],
    ['PUT', `${base}/order`, { ids: [] }, /순서를 바꿀 목차 ID 목록을 보내세요/],
    ['PUT', `${base}/order`, { ids: [1, 2, 1] }, /목차 ID가 중복되었습니다/],
    ['PUT', `${base}/order`, { ids: [1, -2] }, /목차 ID가 올바르지 않습니다/],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [method, path, body, message] of cases) {
      const { status, data } = await call(path, { method, body });
      assert.equal(status, 400, `${method} ${path} ${JSON.stringify(body)}`);
      assert.match(String(data.error), message);
    }
  });
});

test('textbook and content ids in the path are checked before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const id of ['0', '1e3', '01', '99999999999999999999']) {
      for (const [method, body] of [
        ['GET', undefined],
        ['POST', { title: '행렬' }],
        ['PUT', { ids: [1] }],
      ] as const) {
        const path =
          method === 'PUT'
            ? `/api/textbooks/${id}/contents/order`
            : `/api/textbooks/${id}/contents`;
        const { status, data } = await call(path, { method, body });
        assert.equal(status, 400, `${method} ${id}`);
        assert.match(String(data.error), /교재 ID가 올바르지 않습니다/);
      }
      for (const init of [{ method: 'PUT', body: { title: '행렬' } }, { method: 'DELETE' }]) {
        const { status, data } = await call(`${base}/${id}`, init);
        assert.equal(status, 400, `${init.method} content ${id}`);
        assert.match(String(data.error), /목차 ID가 올바르지 않습니다/);
      }
    }
  });
});

test('contents of a missing textbook answer a Korean 404 and writes roll back', async () => {
  const { pool, statements, released } = missingTextbookPool();
  await withApi(pool, async (call) => {
    for (const [path, init] of [
      [base, {}],
      [base, { method: 'POST', body: { title: '행렬' } }],
      [`${base}/order`, { method: 'PUT', body: { ids: [1] } }],
      [`${base}/1`, { method: 'DELETE' }],
    ] as const) {
      const { status, data } = await call(path, init);
      assert.equal(status, 404, JSON.stringify(init));
      assert.equal(data.error, '교재를 찾을 수 없습니다');
    }
    const updated = await call(`${base}/1`, { method: 'PUT', body: { title: '행렬' } });
    assert.equal(updated.status, 404);
    assert.equal(updated.data.error, '목차를 찾을 수 없습니다');
  });
  // Three write transactions: each locks the textbook, finds nothing and rolls back.
  assert.equal(statements.filter((sql) => sql === 'ROLLBACK').length, 3);
  assert.equal(statements.filter((sql) => sql === 'COMMIT').length, 0);
  assert.equal(released(), 3);
});
