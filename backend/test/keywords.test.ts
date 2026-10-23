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

test('invalid keywords are rejected with Korean messages before touching the DB', async () => {
  const cases: [unknown, RegExp][] = [
    [{}, /키워드를 입력하세요/],
    [{ keyword: '  ' }, /키워드를 입력하세요/],
    [{ keyword: 3 }, /키워드 형식이 올바르지 않습니다/],
    [{ keyword: 'x'.repeat(51) }, /키워드는 50자 이하로 입력하세요/],
    [{ keyword: '고유값\n고유벡터' }, /키워드는 한 줄로 입력하세요/],
    [{ keyword: '고유값', memo: 'x'.repeat(2001) }, /메모는 2000자 이하로 입력하세요/],
    [{ keyword: '고유값', date: '2026/10/23' }, /날짜는 YYYY-MM-DD 형식으로 입력하세요/],
    [{ keyword: '고유값', date: '2026-02-30' }, /존재하지 않는 날짜입니다/],
    [['고유값'], /키워드 내용을 JSON 객체로 보내세요/],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [body, message] of cases) {
      for (const [method, path] of [
        ['POST', '/api/keywords'],
        ['PUT', '/api/keywords/1'],
      ]) {
        const { status, data } = await call(path, { method, body });
        assert.equal(status, 400, `${method} ${JSON.stringify(body).slice(0, 60)}`);
        assert.match(String(data.error), message);
      }
    }
  });
});

test('list filters and ids are checked before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const [path, message] of [
      ['/api/keywords?date=2026-13-01', /존재하지 않는 날짜입니다/],
      ['/api/keywords?q=' + 'x'.repeat(51), /검색어는 50자 이하로 입력하세요/],
      ['/api/keywords?from=2026-10-23&to=2026-10-01', /시작일은 종료일보다 늦을 수 없습니다/],
      ['/api/keywords?limit=0', /조회 개수는 1 이상이어야 합니다/],
      ['/api/keywords?limit=201', /조회 개수는 200 이하여야 합니다/],
      ['/api/keywords/01', /키워드 ID가 올바르지 않습니다/],
    ] as const) {
      const { status, data } = await call(path);
      assert.equal(status, 400, path);
      assert.match(String(data.error), message);
    }
  });
});

test('a missing keyword answers a Korean 404 and a duplicate a Korean 409', async () => {
  await withApi(emptyPool, async (call) => {
    for (const init of [{}, { method: 'PUT', body: { keyword: '행렬' } }, { method: 'DELETE' }]) {
      const { status, data } = await call('/api/keywords/9', init);
      assert.equal(status, 404, JSON.stringify(init));
      assert.equal(data.error, '키워드를 찾을 수 없습니다');
    }
  });
  const duplicatePool = {
    query: async () => {
      throw Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'keywords_date_keyword_key',
      });
    },
  } as unknown as Pool;
  await withApi(duplicatePool, async (call) => {
    for (const [method, path] of [
      ['POST', '/api/keywords'],
      ['PUT', '/api/keywords/1'],
    ]) {
      const { status, data } = await call(path, { method, body: { keyword: '행렬' } });
      assert.equal(status, 409, method);
      assert.equal(data.error, '이 날짜에 이미 있는 키워드입니다');
    }
  });
});

test('a keyword without a date is saved for today in the service time zone', async () => {
  const sent: unknown[][] = [];
  const pool = {
    query: async (_sql: string, params: unknown[]) => {
      sent.push(params);
      return { rows: [{}], rowCount: 1 };
    },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const added = await call('/api/keywords', { method: 'POST', body: { keyword: ' 고유값 ' } });
      assert.equal(added.status, 201);
      assert.deepEqual(sent[0], ['2026-10-23', '고유값', '']);
      await call('/api/keywords', {
        method: 'POST',
        body: { keyword: '대각화', date: '2026-10-01', memo: '메모' },
      });
      assert.deepEqual(sent[1], ['2026-10-01', '대각화', '메모']);
    },
    { today: () => '2026-10-23' },
  );
});

test('search wildcards are matched as plain characters', async () => {
  const sent: unknown[][] = [];
  const pool = {
    query: async (_sql: string, params: unknown[]) => {
      sent.push(params);
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    await call('/api/keywords?q=' + encodeURIComponent(' 50%_\\ '));
    assert.deepEqual(sent[0], ['%50\\%\\_\\\\%', 50]);
  });
});
