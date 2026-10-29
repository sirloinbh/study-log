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

const answer = '/api/exercises/1/answer';

test('invalid answers are rejected with Korean messages before touching the DB', async () => {
  const cases: [unknown, RegExp][] = [
    [{}, /정답을 입력하세요/],
    [{ body: ' \n\t ' }, /정답을 입력하세요/],
    [{ body: 7 }, /정답 형식이 올바르지 않습니다/],
    [{ body: 'x'.repeat(20001) }, /정답은 20000자 이하로 입력하세요/],
    [['x'], /정답 내용을 JSON 객체로 보내세요/],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [body, message] of cases) {
      const { status, data } = await call(answer, { method: 'PUT', body });
      assert.equal(status, 400, JSON.stringify(body).slice(0, 60));
      assert.match(String(data.error), message);
    }
    for (const init of [{}, { method: 'PUT', body: { body: '답' } }, { method: 'DELETE' }]) {
      const { status, data } = await call('/api/exercises/01/answer', init);
      assert.equal(status, 400, JSON.stringify(init));
      assert.match(String(data.error), /연습문제 ID가 올바르지 않습니다/);
    }
  });
});

test('the answer of a missing exercise answers a Korean 404', async () => {
  await withApi(emptyPool, async (call) => {
    for (const init of [{}, { method: 'DELETE' }]) {
      const { status, data } = await call(answer, init);
      assert.equal(status, 404, JSON.stringify(init));
      assert.equal(data.error, '연습문제를 찾을 수 없습니다');
    }
  });
  const foreignKeyPool = {
    query: async () => {
      throw Object.assign(new Error('violates foreign key'), { code: '23503' });
    },
  } as unknown as Pool;
  await withApi(foreignKeyPool, async (call) => {
    const { status, data } = await call(answer, { method: 'PUT', body: { body: '답' } });
    assert.equal(status, 404);
    assert.equal(data.error, '연습문제를 찾을 수 없습니다');
  });
  // The exercise exists but has no answer to delete.
  const noAnswerPool = {
    query: async (sql: string) =>
      sql.startsWith('DELETE') ? { rows: [], rowCount: 0 } : { rows: [{}], rowCount: 1 },
  } as unknown as Pool;
  await withApi(noAnswerPool, async (call) => {
    const { status, data } = await call(answer, { method: 'DELETE' });
    assert.equal(status, 404);
    assert.equal(data.error, '정답을 찾을 수 없습니다');
  });
});

test('an exercise without an answer reads as null and the answer keeps its line breaks', async () => {
  const sent: unknown[][] = [];
  const pool = {
    query: async (sql: string, params: unknown[]) => {
      sent.push(params);
      return sql.startsWith('SELECT')
        ? { rows: [{ body: null }], rowCount: 1 }
        : { rows: [{ exerciseId: 1, body: params[1] }], rowCount: 1 };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    const read = await call(answer);
    assert.equal(read.status, 200);
    assert.deepEqual(read.data, { answer: null });
    const body = '  x = 2\n\n  (풀이 생략)\n';
    const saved = await call(answer, { method: 'PUT', body: { body } });
    assert.equal(saved.status, 200);
    assert.deepEqual(sent[1], [1, body]);
    assert.deepEqual(saved.data, { answer: { exerciseId: 1, body } });
  });
});

test('marking important takes a boolean and answers 404 for a missing exercise', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const [body, message] of [
      [{}, /중요 표시 여부를 보내세요/],
      [{ important: 'true' }, /중요 표시 형식이 올바르지 않습니다/],
      [[true], /중요 표시 여부를 JSON 객체로 보내세요/],
    ] as const) {
      const { status, data } = await call('/api/exercises/1/important', { method: 'PATCH', body });
      assert.equal(status, 400, JSON.stringify(body));
      assert.match(String(data.error), message);
    }
  });
  await withApi(emptyPool, async (call) => {
    const { status, data } = await call('/api/exercises/9/important', {
      method: 'PATCH',
      body: { important: true },
    });
    assert.equal(status, 404);
    assert.equal(data.error, '연습문제를 찾을 수 없습니다');
  });
});

test('textbook exercise filters are checked before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const [path, message] of [
      ['/api/textbooks/01/exercises', /교재 ID가 올바르지 않습니다/],
      ['/api/textbooks/1/exercises?contentId=0', /목차 ID가 올바르지 않습니다/],
      ['/api/textbooks/1/exercises?important=yes', /중요 표시 조건이 올바르지 않습니다/],
    ] as const) {
      const { status, data } = await call(path);
      assert.equal(status, 400, path);
      assert.match(String(data.error), message);
    }
  });
});

test('a missing textbook or chapter of a textbook exercise list answers a Korean 404', async () => {
  for (const [found, path, message] of [
    [{ textbook: false, content: false }, '/api/textbooks/9/exercises', '교재를 찾을 수 없습니다'],
    [
      { textbook: true, content: false },
      '/api/textbooks/9/exercises?contentId=3',
      '목차를 찾을 수 없습니다',
    ],
  ] as const) {
    const pool = { query: async () => ({ rows: [found], rowCount: 1 }) } as unknown as Pool;
    await withApi(pool, async (call) => {
      const { status, data } = await call(path);
      assert.equal(status, 404, path);
      assert.equal(data.error, message);
    });
  }
});
