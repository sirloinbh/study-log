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

const list = '/api/textbooks/1/contents/2/exercises';

test('invalid exercises are rejected with Korean messages before touching the DB', async () => {
  const cases: [unknown, RegExp][] = [
    [{ number: '1' }, /문제 본문을 입력하세요/],
    [{ body: ' \n\t ' }, /문제 본문을 입력하세요/],
    [{ body: 7 }, /문제 본문 형식이 올바르지 않습니다/],
    [{ body: 'x'.repeat(20001) }, /문제 본문은 20000자 이하로 입력하세요/],
    [
      { body: '행렬 A를 구하시오', number: 'x'.repeat(21) },
      /문제 번호 길이는 20자 이하여야 합니다/,
    ],
    [{ body: '행렬 A를 구하시오', number: 3 }, /문제 번호 형식이 올바르지 않습니다/],
    [{ body: '행렬 A를 구하시오', important: 'yes' }, /중요 표시 형식이 올바르지 않습니다/],
    [[{ body: '행렬 A를 구하시오' }], /연습문제 내용을 JSON 객체로 보내세요/],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [body, message] of cases) {
      for (const [method, path] of [
        ['POST', list],
        ['PUT', '/api/exercises/1'],
      ]) {
        const { status, data } = await call(path, { method, body });
        assert.equal(status, 400, `${method} ${JSON.stringify(body).slice(0, 60)}`);
        assert.match(String(data.error), message);
      }
    }
  });
});

test('path ids are checked before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const id of ['0', '1e3', '01', '99999999999999999999']) {
      for (const [path, message] of [
        [`/api/textbooks/${id}/contents/2/exercises`, /교재 ID가 올바르지 않습니다/],
        [`/api/textbooks/1/contents/${id}/exercises`, /목차 ID가 올바르지 않습니다/],
        [`/api/exercises/${id}`, /연습문제 ID가 올바르지 않습니다/],
      ] as const) {
        for (const init of [{}, { method: 'PUT', body: { body: '문제' } }]) {
          // A list path has no PUT; only check the exercise path for it.
          if (init.method === 'PUT' && !path.startsWith('/api/exercises')) continue;
          const { status, data } = await call(path, init);
          assert.equal(status, 400, `${path} ${init.method ?? 'GET'}`);
          assert.match(String(data.error), message);
        }
      }
    }
  });
});

test('a missing chapter or exercise answers a Korean 404', async () => {
  await withApi(emptyPool, async (call) => {
    const listed = await call(list);
    assert.equal(listed.status, 404);
    assert.equal(listed.data.error, '목차를 찾을 수 없습니다');
    for (const init of [{}, { method: 'PUT', body: { body: '문제' } }, { method: 'DELETE' }]) {
      const { status, data } = await call('/api/exercises/9', init);
      assert.equal(status, 404, JSON.stringify(init));
      assert.equal(data.error, '연습문제를 찾을 수 없습니다');
    }
  });
  // Adding to a chapter that does not exist fails its foreign key.
  const foreignKeyPool = {
    query: async () => {
      throw Object.assign(new Error('violates foreign key'), { code: '23503' });
    },
  } as unknown as Pool;
  await withApi(foreignKeyPool, async (call) => {
    const { status, data } = await call(list, { method: 'POST', body: { body: '문제' } });
    assert.equal(status, 404);
    assert.equal(data.error, '목차를 찾을 수 없습니다');
  });
});

test('the body keeps its line breaks and the number is trimmed', async () => {
  const sent: unknown[][] = [];
  const pool = {
    query: async (_sql: string, params: unknown[]) => {
      sent.push(params);
      return { rows: [{}], rowCount: 1 };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    const body = '  다음 행렬의 역행렬을 구하시오.\n\n  A = [[1, 2], [3, 4]]\n';
    const { status } = await call(list, { method: 'POST', body: { number: ' 3.1 ', body } });
    assert.equal(status, 201);
    assert.deepEqual(sent[0], [1, 2, '3.1', body, false]);
  });
});
