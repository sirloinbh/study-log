import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { studyMinutes } from '../src/study-logs.js';
import { withApi } from './helpers.js';

// Validation must reject input before any query reaches the database.
const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;
const emptyPool = { query: async () => ({ rows: [], rowCount: 0 }) } as unknown as Pool;

const valid = { studyDate: '2026-10-21', startTime: '09:00', endTime: '10:30' };

test('study minutes are the time between start and end', () => {
  assert.equal(studyMinutes('09:00', '10:30'), 90);
  assert.equal(studyMinutes('00:00', '23:59'), 1439);
});

test('a session that passes midnight counts in full toward its start date', () => {
  assert.equal(studyMinutes('23:00', '01:00'), 120);
  assert.equal(studyMinutes('23:59', '00:00'), 1);
});

test('invalid study logs are rejected with Korean messages before touching the DB', async () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ startTime: '09:00', endTime: '10:00' }, /학습일을 입력하세요/],
    [{ ...valid, studyDate: '2026/10/21' }, /YYYY-MM-DD/],
    [{ ...valid, studyDate: '2026-02-30' }, /존재하지 않는 날짜/],
    [{ ...valid, startTime: '24:00' }, /시작 시각은 HH:MM/],
    [{ ...valid, endTime: '9:5' }, /종료 시각은 HH:MM/],
    [{ ...valid, endTime: '09:00' }, /종료 시각은 시작 시각과 달라야 합니다/],
    [{ ...valid, status: 'finished' }, /계획, 진행 중, 완료, 중단/],
    [{ ...valid, memo: 'a'.repeat(10001) }, /10000자 이하/],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [body, message] of cases) {
      const { status, data } = await call('/api/study-logs', { method: 'POST', body });
      assert.equal(status, 400, JSON.stringify(body));
      assert.match(String(data.error), message);
    }
  });
});

test('invalid list queries and ids are rejected in Korean', async () => {
  await withApi(untouchedPool, async (call) => {
    assert.match(
      String((await call('/api/study-logs?date=2026-13-01')).data.error),
      /존재하지 않는 날짜/,
    );
    assert.match(String((await call('/api/study-logs?limit=500')).data.error), /100 이하/);
    const { status, data } = await call('/api/study-logs/abc');
    assert.equal(status, 400);
    assert.match(String(data.error), /학습 기록 ID가 올바르지 않습니다/);
  });
});

test('bodies that are not a JSON object are rejected in Korean before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const init of [
      { method: 'POST' },
      { method: 'POST', body: [valid] },
      { method: 'PUT', body: [valid] },
    ]) {
      const path = init.method === 'PUT' ? '/api/study-logs/1' : '/api/study-logs';
      const { status, data } = await call(path, init);
      assert.equal(status, 400, JSON.stringify(init));
      assert.equal(data.error, '학습 기록 내용을 JSON 객체로 보내세요');
    }
    // Broken JSON and bare JSON strings are refused by the JSON body parser itself.
    for (const rawBody of ['{"studyDate":', '"text"']) {
      const malformed = await call('/api/study-logs', { method: 'POST', rawBody });
      assert.equal(malformed.status, 400, rawBody);
      assert.equal(malformed.data.error, '요청 본문의 JSON 형식이 올바르지 않습니다');
    }
    const tooLarge = await call('/api/study-logs', {
      method: 'POST',
      rawBody: JSON.stringify({ ...valid, memo: 'a'.repeat(300 * 1024) }),
    });
    assert.equal(tooLarge.status, 413);
    assert.equal(tooLarge.data.error, '요청 본문이 너무 큽니다');
  });
});

test('ids that are not plain positive integers are rejected before touching the DB', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const id of ['0', '-1', '1.5', '1e3', '0x10', '01', '99999999999999999999']) {
      for (const init of [{}, { method: 'PUT', body: valid }, { method: 'DELETE' }]) {
        const { status, data } = await call(`/api/study-logs/${id}`, init);
        assert.equal(status, 400, `${id} ${JSON.stringify(init)}`);
        assert.match(String(data.error), /학습 기록 ID가 올바르지 않습니다/);
      }
    }
  });
});

test('missing study logs answer a Korean 404 for read, update and delete', async () => {
  await withApi(emptyPool, async (call) => {
    for (const init of [{}, { method: 'PUT', body: valid }, { method: 'DELETE' }]) {
      const { status, data } = await call('/api/study-logs/999', init);
      assert.equal(status, 404);
      assert.equal(data.error, '학습 기록을 찾을 수 없습니다');
    }
  });
});
