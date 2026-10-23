import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { periodOf } from '../src/retrospectives.js';
import { withApi } from './helpers.js';

const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;

test('a weekly period runs Sunday to Saturday and a monthly one 1st to last day (#19)', () => {
  // 2026-10-23 is a Friday; 2026-10-18 a Sunday and 2026-10-24 a Saturday.
  assert.deepEqual(periodOf('weekly', '2026-10-23'), { from: '2026-10-18', to: '2026-10-24' });
  assert.deepEqual(periodOf('weekly', '2026-10-18'), { from: '2026-10-18', to: '2026-10-24' });
  assert.deepEqual(periodOf('weekly', '2026-10-24'), { from: '2026-10-18', to: '2026-10-24' });
  assert.deepEqual(periodOf('weekly', '2026-12-31'), { from: '2026-12-27', to: '2027-01-02' });
  assert.deepEqual(periodOf('monthly', '2026-10-23'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(periodOf('monthly', '2028-02-10'), { from: '2028-02-01', to: '2028-02-29' });
});

test('invalid periods and bodies are Korean 400s before touching the DB', async () => {
  const week = '/api/retrospectives/weekly/2026-10-18';
  const cases: [string, string, unknown, RegExp][] = [
    ['PUT', '/api/retrospectives/daily/2026-10-18', { body: '회고' }, /주간 또는 월간/],
    [
      'PUT',
      '/api/retrospectives/weekly/2026-10-19',
      { body: '회고' },
      /주간 회고는 일요일부터 시작합니다/,
    ],
    [
      'PUT',
      '/api/retrospectives/monthly/2026-10-02',
      { body: '회고' },
      /월간 회고는 1일부터 시작합니다/,
    ],
    ['PUT', '/api/retrospectives/weekly/2026-02-30', { body: '회고' }, /존재하지 않는 날짜/],
    ['DELETE', '/api/retrospectives/weekly/2026-10-20', undefined, /주간 회고는 일요일부터/],
    ['PUT', week, { body: ' \n ' }, /회고 내용을 입력하세요/],
    ['PUT', week, {}, /회고 내용을 입력하세요/],
    ['PUT', week, { body: 'x'.repeat(20001) }, /20000자 이하/],
    ['PUT', week, ['회고'], /JSON 객체로 보내세요/],
    ['GET', '/api/retrospectives/period?kind=yearly', undefined, /주간 또는 월간/],
    ['GET', '/api/retrospectives/period?date=2026-13-01', undefined, /존재하지 않는 날짜/],
    ['GET', '/api/retrospectives?limit=0', undefined, /1 이상/],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [method, path, body, message] of cases) {
      const { status, data } = await call(path, { method, body });
      assert.equal(status, 400, `${method} ${path}`);
      assert.match(String(data.error), message);
    }
  });
});

test('writing passes the whole period; the period view defaults to this week', async () => {
  const sent: unknown[][] = [];
  const pool = {
    query: async (sql: string, params: unknown[]) => {
      sent.push(params);
      if (sql.startsWith('SELECT COALESCE')) return { rows: [{ totalMinutes: 0 }] };
      return { rows: sql.startsWith('INSERT') ? [{ id: 1 }] : [], rowCount: 0 };
    },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const saved = await call('/api/retrospectives/monthly/2026-02-01', {
        method: 'PUT',
        body: { body: '  2월 회고\n' },
      });
      assert.equal(saved.status, 200);
      assert.deepEqual(sent[0], ['monthly', '2026-02-01', '2026-02-28', '  2월 회고\n']);
      const period = await call('/api/retrospectives/period');
      assert.equal(period.status, 200);
      assert.deepEqual(
        [period.data.kind, period.data.from, period.data.to],
        ['weekly', '2026-10-18', '2026-10-24'],
      );
      assert.equal(period.data.retrospective, null);
      const gone = await call('/api/retrospectives/weekly/2026-10-18', { method: 'DELETE' });
      assert.equal(gone.status, 404);
      assert.equal(gone.data.error, '회고를 찾을 수 없습니다');
    },
    { today: () => '2026-10-23' },
  );
});
