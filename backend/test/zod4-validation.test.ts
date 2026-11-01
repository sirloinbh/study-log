import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

// Keeps the values each query got, so a test can see what validation handed to the database.
const recordingPool = () => {
  const params: unknown[][] = [];
  const query = async (_sql: string, values: unknown[] = []) => {
    params.push(values);
    return { rows: [{ id: 1 }], rowCount: 1 };
  };
  return {
    params,
    pool: { query, connect: async () => ({ query, release: () => {} }) } as unknown as Pool,
  };
};

const paramsOf = (params: unknown[][], value: unknown) =>
  params.find((values) => values.includes(value));

test('left-out fields get their defaults, and fields sent are kept (#151)', async () => {
  const { params, pool } = recordingPool();
  const day = '2026-01-02';
  await withApi(
    pool,
    async (call) => {
      const session = { studyDate: day, startTime: '09:00', endTime: '10:00' };
      assert.equal((await call('/api/study-logs', { method: 'POST', body: session })).status, 201);
      assert.deepEqual(paramsOf(params, day), [
        day,
        '09:00',
        '10:00',
        60,
        '',
        'planned',
        null,
        null,
        null,
        '',
        null,
        'new',
      ]);

      params.length = 0;
      const sent = {
        ...session,
        memo: 'm',
        status: 'done',
        textbookId: 1,
        contentId: 2,
        understanding: 3,
        difficulties: 'd',
        goalAchieved: false,
        studyType: 'review',
      };
      assert.equal((await call('/api/study-logs', { method: 'POST', body: sent })).status, 201);
      assert.deepEqual(paramsOf(params, day), [
        day,
        '09:00',
        '10:00',
        60,
        'm',
        'done',
        1,
        2,
        3,
        'd',
        false,
        'review',
      ]);

      params.length = 0;
      await call('/api/textbooks', { method: 'POST', body: { title: ' T ' } });
      assert.deepEqual(params[0], ['T', '', '']);

      params.length = 0;
      await call('/api/keywords', { method: 'POST', body: { keyword: ' k ' } });
      assert.deepEqual(params[0], ['2026-10-23', 'k', '']);

      params.length = 0;
      await call('/api/exercises/1', { method: 'PUT', body: { body: ' b ' } });
      assert.deepEqual(params[0], [1, '', ' b ', false]);

      params.length = 0;
      await call('/api/keywords');
      assert.deepEqual(params[0], [50]);

      params.length = 0;
      await call('/api/study-logs');
      assert.deepEqual(params[0], [20]);

      params.length = 0;
      await call('/api/retrospectives');
      assert.deepEqual(params[0], [null, 20]);
    },
    { today: () => '2026-10-23' },
  );
});

test('a missing value and a value of the wrong type keep their own messages (#151)', async () => {
  const untouchedPool = {
    query: async () => {
      throw new Error('DB must not be queried for invalid input');
    },
  } as unknown as Pool;
  const cases: [string, string, unknown, string][] = [
    ['POST', '/api/textbooks', {}, '제목을 입력하세요'],
    ['POST', '/api/textbooks', { title: 1 }, '제목 형식이 올바르지 않습니다'],
    ['POST', '/api/textbooks', [], '교재 내용을 JSON 객체로 보내세요'],
    // zod 4's own .min() and .max() also run on a list of the wrong type and add a second message.
    ['POST', '/api/textbooks', { title: [] }, '제목 형식이 올바르지 않습니다'],
    [
      'POST',
      '/api/textbooks',
      { title: 't', author: Array(201).fill(1) },
      '저자 형식이 올바르지 않습니다',
    ],
    ['POST', '/api/keywords', { keyword: [] }, '키워드 형식이 올바르지 않습니다'],
    ['POST', '/api/textbooks/1/contents', { title: [] }, '목차 제목 형식이 올바르지 않습니다'],
    ['POST', '/api/textbooks/1/contents/bulk', { entries: '' }, '등록할 목차 목록을 보내세요'],
    ['PUT', '/api/textbooks/1/contents/order', { ids: '' }, '순서를 바꿀 목차 ID 목록을 보내세요'],
    // Length stays in UTF-16 units; zod 4.6.7's .max() would count these 202 units as 101.
    ['POST', '/api/textbooks', { title: '😀'.repeat(101) }, '제목 길이는 200자 이하여야 합니다'],
    ['POST', '/api/keywords', {}, '키워드를 입력하세요'],
    ['POST', '/api/keywords', { keyword: null }, '키워드 형식이 올바르지 않습니다'],
    ['PATCH', '/api/exercises/1/important', {}, '중요 표시 여부를 보내세요'],
    [
      'PATCH',
      '/api/exercises/1/important',
      { important: 'y' },
      '중요 표시 형식이 올바르지 않습니다',
    ],
    ['PUT', '/api/exercises/1/answer', {}, '정답을 입력하세요'],
    ['PUT', '/api/exercises/1/answer', { body: 1 }, '정답 형식이 올바르지 않습니다'],
    ['PUT', '/api/reviews/1/due-date', {}, '예정일을 입력하세요'],
    ['PUT', '/api/reviews/1/due-date', { dueDate: 1 }, '예정일 형식이 올바르지 않습니다'],
    ['PUT', '/api/retrospectives/weekly/2026-10-18', {}, '회고 내용을 입력하세요'],
    [
      'PUT',
      '/api/retrospectives/weekly/2026-10-18',
      { body: 1 },
      '회고 내용 형식이 올바르지 않습니다',
    ],
    [
      'PUT',
      '/api/retrospectives/weekly/2026-10-19',
      { body: 'b' },
      '주간 회고는 일요일부터 시작합니다',
    ],
    ['POST', '/api/textbooks/1/contents', {}, '목차 제목을 입력하세요'],
    ['POST', '/api/textbooks/1/contents', { title: 1 }, '목차 제목 형식이 올바르지 않습니다'],
    [
      'POST',
      '/api/textbooks/1/contents/bulk',
      { entries: [{ title: 't' }] },
      '목차 단계를 보내세요',
    ],
    ['POST', '/api/textbooks/1/contents/bulk', {}, '등록할 목차 목록을 보내세요'],
    [
      'POST',
      '/api/textbooks/1/contents/bulk',
      { entries: [{ level: 1, title: 't' }] },
      '첫 목차는 맨 위 단계여야 합니다',
    ],
    ['PUT', '/api/textbooks/1/contents/order', {}, '순서를 바꿀 목차 ID 목록을 보내세요'],
    ['PUT', '/api/textbooks/1/contents/order', { ids: [1, 1] }, '목차 ID가 중복되었습니다'],
    ['GET', '/api/keywords?limit=abc', undefined, '조회 개수가 올바르지 않습니다'],
    [
      'GET',
      '/api/stats/study-time?period=day',
      undefined,
      '기간은 이번 주, 이번 달, 최근 3개월, 전체 중에서 고르세요',
    ],
    ['GET', '/api/study-logs/calendar?month=1&month=2', undefined, '월 형식이 올바르지 않습니다'],
    // Query values arrive as a list when repeated; these two were zod's English default before.
    ['GET', '/api/study-logs?textbookId=1&textbookId=2', undefined, '교재 ID가 올바르지 않습니다'],
    [
      'GET',
      '/api/textbooks/1/exercises?contentId=1&contentId=2',
      undefined,
      '목차 ID가 올바르지 않습니다',
    ],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [method, path, body, message] of cases) {
      const { status, data } = await call(path, { method, body });
      assert.equal(status, 400, `${method} ${path}`);
      assert.equal(data.error, message, `${method} ${path}`);
    }
  });
});

test('the length limits of lists still apply (#151)', async () => {
  const untouchedPool = {
    connect: async () => {
      throw new Error('DB must not be queried for invalid input');
    },
  } as unknown as Pool;
  await withApi(untouchedPool, async (call) => {
    const order = await call('/api/textbooks/1/contents/order', {
      method: 'PUT',
      body: { ids: Array.from({ length: 1001 }, (_, i) => i + 1) },
    });
    assert.equal(order.status, 400);
    assert.equal(order.data.error, '목차 순서는 한 번에 1000개까지 바꿀 수 있습니다');
    const bulk = await call('/api/textbooks/1/contents/bulk', {
      method: 'POST',
      body: { entries: Array.from({ length: 501 }, () => ({ level: 0, title: 't' })) },
    });
    assert.equal(bulk.status, 400);
    assert.equal(bulk.data.error, '목차는 한 번에 500개까지 등록할 수 있습니다');
    const badElements = await call('/api/textbooks/1/contents/order', {
      method: 'PUT',
      body: { ids: Array(1001).fill('a') },
    });
    assert.equal(badElements.status, 400);
    assert.match(String(badElements.data.error), /목차 순서는 한 번에 1000개까지 바꿀 수 있습니다/);
  });
});
