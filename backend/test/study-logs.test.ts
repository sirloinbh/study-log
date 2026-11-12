import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { studyMinutes } from '../src/study-logs.js';
import { withApi } from './helpers.js';

// Validation must reject input before any query reaches the database.
const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;
const emptyResult = async () => ({ rows: [], rowCount: 0 });
const emptyPool = {
  query: emptyResult,
  connect: async () => ({ query: emptyResult, release: () => {} }),
} as unknown as Pool;

const valid = { studyDate: '2026-10-21', startTime: '09:00', endTime: '10:30' };

test('study minutes are the time between start and end', () => {
  assert.equal(studyMinutes('09:00', '10:30'), 90);
  assert.equal(studyMinutes('00:00', '23:59'), 1439);
});

test('a session that passes midnight counts in full toward its start date', () => {
  assert.equal(studyMinutes('23:00', '01:00'), 120);
  assert.equal(studyMinutes('23:59', '00:00'), 1);
});

test('invalid study logs are rejected with English messages before touching the DB', async () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ startTime: '09:00', endTime: '10:00' }, /Enter the study date/],
    [{ ...valid, studyDate: '2026/10/21' }, /YYYY-MM-DD/],
    [{ ...valid, studyDate: '2026-02-30' }, /This date does not exist/],
    [{ ...valid, studyDate: '0000-01-01' }, /This date does not exist/],
    [{ ...valid, startTime: '24:00' }, /start time must be in HH:MM/],
    [{ ...valid, endTime: '9:5' }, /end time must be in HH:MM/],
    [{ ...valid, endTime: '09:00' }, /The end time must differ from the start time/],
    [{ ...valid, status: 'finished' }, /planned, in progress, done, or stopped/],
    [{ ...valid, memo: 'a'.repeat(10001) }, /at most 10000 characters/],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [body, message] of cases) {
      const { status, data } = await call('/api/study-logs', { method: 'POST', body });
      assert.equal(status, 400, JSON.stringify(body));
      assert.match(String(data.error), message);
    }
  });
});

test('invalid list queries and ids are rejected in English', async () => {
  await withApi(untouchedPool, async (call) => {
    assert.match(
      String((await call('/api/study-logs?date=2026-13-01')).data.error),
      /This date does not exist/,
    );
    assert.match(String((await call('/api/study-logs?limit=500')).data.error), /at most 100/);
    const { status, data } = await call('/api/study-logs/abc');
    assert.equal(status, 400);
    assert.match(String(data.error), /Invalid study log ID/);
  });
});

test('bodies that are not a JSON object are rejected in English before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const init of [
      { method: 'POST' },
      { method: 'POST', body: [valid] },
      { method: 'PUT', body: [valid] },
    ]) {
      const path = init.method === 'PUT' ? '/api/study-logs/1' : '/api/study-logs';
      const { status, data } = await call(path, init);
      assert.equal(status, 400, JSON.stringify(init));
      assert.equal(data.error, 'Send the study log as a JSON object');
    }
    // Broken JSON and bare JSON strings are refused by the JSON body parser itself.
    for (const rawBody of ['{"studyDate":', '"text"']) {
      const malformed = await call('/api/study-logs', { method: 'POST', rawBody });
      assert.equal(malformed.status, 400, rawBody);
      assert.equal(malformed.data.error, 'Request body is not valid JSON');
    }
    const tooLarge = await call('/api/study-logs', {
      method: 'POST',
      rawBody: JSON.stringify({ ...valid, memo: 'a'.repeat(300 * 1024) }),
    });
    assert.equal(tooLarge.status, 413);
    assert.equal(tooLarge.data.error, 'Request body is too large');
    const unsupported = await call('/api/study-logs', {
      method: 'POST',
      rawBody: JSON.stringify(valid),
      contentType: 'application/json; charset=latin1',
    });
    assert.equal(unsupported.status, 415);
    assert.equal(unsupported.data.error, 'Cannot process the request');
  });
});

test('ids that are not plain positive integers are rejected before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const id of ['0', '-1', '1.5', '1e3', '0x10', '01', '99999999999999999999']) {
      for (const init of [{}, { method: 'PUT', body: valid }, { method: 'DELETE' }]) {
        const { status, data } = await call(`/api/study-logs/${id}`, init);
        assert.equal(status, 400, `${id} ${JSON.stringify(init)}`);
        assert.match(String(data.error), /Invalid study log ID/);
      }
    }
  });
});

test('missing study logs answer an English 404 for read, update and delete', async () => {
  await withApi(emptyPool, async (call) => {
    for (const init of [{}, { method: 'PUT', body: valid }, { method: 'DELETE' }]) {
      const { status, data } = await call('/api/study-logs/999', init);
      assert.equal(status, 404);
      assert.equal(data.error, 'Study log not found');
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
      const { status, data } = await call('/api/study-logs', {
        method: 'POST',
        body: { ...valid, memo: '메모\u0000' },
      });
      assert.equal(status, 400);
      assert.equal(data.error, 'Input contains a character that is not allowed (NUL)');
    });
  } finally {
    console.error = original;
  }
  assert.deepEqual(logged, []);
});

test('search conditions are checked before touching the DB (#18)', async () => {
  const untouchedPool = {
    query: async () => {
      throw new Error('DB must not be queried for invalid input');
    },
  } as unknown as Pool;
  await withApi(untouchedPool, async (call) => {
    for (const [path, message] of [
      ['/api/study-logs?q=' + 'x'.repeat(51), /The search term must be at most 50 characters/],
      [
        '/api/study-logs?from=2026-10-23&to=2026-10-01',
        /The start date cannot be after the end date/,
      ],
      ['/api/study-logs?from=2026-02-30', /This date does not exist/],
      ['/api/study-logs?to=2026/10/01', /YYYY-MM-DD/],
    ] as const) {
      const { status, data } = await call(path);
      assert.equal(status, 400, path);
      assert.match(String(data.error), message);
    }
  });
});

test('search conditions combine, and wildcards in the words are plain characters', async () => {
  const sent: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[]) => {
      sent.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  await withApi(pool, async (call) => {
    await call(
      '/api/study-logs?q=' +
        encodeURIComponent(' 50%_ ') +
        '&from=2026-10-01&to=2026-10-31&textbookId=7&limit=100',
    );
    assert.deepEqual(sent[0].params, [7, '%50\\%\\_%', '2026-10-01', '2026-10-31', 100]);
    assert.match(sent[0].sql, /l\.memo ILIKE \$2 OR l\.difficulties ILIKE \$2/);
  });
});
