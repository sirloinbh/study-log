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
    ['POST', '/api/textbooks', {}, 'Enter the title'],
    ['POST', '/api/textbooks', { title: 1 }, 'The title format is invalid'],
    ['POST', '/api/textbooks', [], 'Send the textbook as a JSON object'],
    // zod 4's own .min() and .max() also run on a list of the wrong type and add a second message.
    ['POST', '/api/textbooks', { title: [] }, 'The title format is invalid'],
    [
      'POST',
      '/api/textbooks',
      { title: 't', author: Array(201).fill(1) },
      'The author format is invalid',
    ],
    ['POST', '/api/keywords', { keyword: [] }, 'The keyword format is invalid'],
    ['POST', '/api/textbooks/1/contents', { title: [] }, 'The contents title format is invalid'],
    [
      'POST',
      '/api/textbooks/1/contents/bulk',
      { entries: '' },
      'Send the list of contents entries to add',
    ],
    [
      'PUT',
      '/api/textbooks/1/contents/order',
      { ids: '' },
      'Send the list of contents entry IDs to reorder',
    ],
    // Length stays in UTF-16 units; zod 4.6.7's .max() would count these 202 units as 101.
    [
      'POST',
      '/api/textbooks',
      { title: '😀'.repeat(101) },
      'The title must be at most 200 characters',
    ],
    ['POST', '/api/keywords', {}, 'Enter a keyword'],
    ['POST', '/api/keywords', { keyword: null }, 'The keyword format is invalid'],
    ['PATCH', '/api/exercises/1/important', {}, 'Send the important flag'],
    [
      'PATCH',
      '/api/exercises/1/important',
      { important: 'y' },
      'The important flag format is invalid',
    ],
    ['PUT', '/api/exercises/1/answer', {}, 'Enter the answer'],
    ['PUT', '/api/exercises/1/answer', { body: 1 }, 'The answer format is invalid'],
    ['PUT', '/api/reviews/1/due-date', {}, 'Enter the due date'],
    ['PUT', '/api/reviews/1/due-date', { dueDate: 1 }, 'The due date format is invalid'],
    ['PUT', '/api/retrospectives/weekly/2026-10-18', {}, 'Enter the retrospective text'],
    [
      'PUT',
      '/api/retrospectives/weekly/2026-10-18',
      { body: 1 },
      'The retrospective text format is invalid',
    ],
    [
      'PUT',
      '/api/retrospectives/weekly/2026-10-19',
      { body: 'b' },
      'A weekly retrospective starts on a Sunday',
    ],
    ['POST', '/api/textbooks/1/contents', {}, 'Enter the contents title'],
    ['POST', '/api/textbooks/1/contents', { title: 1 }, 'The contents title format is invalid'],
    [
      'POST',
      '/api/textbooks/1/contents/bulk',
      { entries: [{ title: 't' }] },
      'Send the contents level',
    ],
    ['POST', '/api/textbooks/1/contents/bulk', {}, 'Send the list of contents entries to add'],
    [
      'POST',
      '/api/textbooks/1/contents/bulk',
      { entries: [{ level: 1, title: 't' }] },
      'The first contents entry must be at the top level',
    ],
    [
      'PUT',
      '/api/textbooks/1/contents/order',
      {},
      'Send the list of contents entry IDs to reorder',
    ],
    [
      'PUT',
      '/api/textbooks/1/contents/order',
      { ids: [1, 1] },
      'Contents entry IDs are duplicated',
    ],
    ['GET', '/api/keywords?limit=abc', undefined, 'The limit is invalid'],
    [
      'GET',
      '/api/stats/study-time?period=day',
      undefined,
      'The period must be this week, this month, last 3 months, or all',
    ],
    ['GET', '/api/study-logs/calendar?month=1&month=2', undefined, 'The month format is invalid'],
    // Query values arrive as a list when repeated; these two were zod's English default before.
    ['GET', '/api/study-logs?textbookId=1&textbookId=2', undefined, 'Invalid textbook ID'],
    [
      'GET',
      '/api/textbooks/1/exercises?contentId=1&contentId=2',
      undefined,
      'Invalid contents entry ID',
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
    assert.equal(order.data.error, 'At most 1000 contents entries can be reordered at once');
    const bulk = await call('/api/textbooks/1/contents/bulk', {
      method: 'POST',
      body: { entries: Array.from({ length: 501 }, () => ({ level: 0, title: 't' })) },
    });
    assert.equal(bulk.status, 400);
    assert.equal(bulk.data.error, 'At most 500 contents entries can be added at once');
    const badElements = await call('/api/textbooks/1/contents/order', {
      method: 'PUT',
      body: { ids: Array(1001).fill('a') },
    });
    assert.equal(badElements.status, 400);
    assert.match(
      String(badElements.data.error),
      /At most 1000 contents entries can be reordered at once/,
    );
  });
});
