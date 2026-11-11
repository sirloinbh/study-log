import assert from 'node:assert/strict';
import { test } from 'node:test';

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

test('invalid periods and bodies are English 400s before touching the DB', async () => {
  const week = '/api/retrospectives/weekly/2026-10-18';
  const cases: [string, string, unknown, RegExp][] = [
    ['PUT', '/api/retrospectives/daily/2026-10-18', { body: '회고' }, /weekly or monthly/],
    [
      'PUT',
      '/api/retrospectives/weekly/2026-10-19',
      { body: '회고' },
      /A weekly retrospective starts on a Sunday/,
    ],
    [
      'PUT',
      '/api/retrospectives/monthly/2026-10-02',
      { body: '회고' },
      /A monthly retrospective starts on the 1st/,
    ],
    ['PUT', '/api/retrospectives/weekly/2026-02-30', { body: '회고' }, /This date does not exist/],
    [
      'DELETE',
      '/api/retrospectives/weekly/2026-10-20',
      undefined,
      /weekly retrospective starts on a Sunday/,
    ],
    ['PUT', week, { body: ' \n ' }, /Enter the retrospective text/],
    ['PUT', week, {}, /Enter the retrospective text/],
    ['PUT', week, { body: 'x'.repeat(20001) }, /at most 20000 characters/],
    ['PUT', week, ['회고'], /as a JSON object/],
    ['GET', '/api/retrospectives/period?kind=yearly', undefined, /weekly or monthly/],
    ['GET', '/api/retrospectives/period?date=2026-13-01', undefined, /This date does not exist/],
    ['GET', '/api/retrospectives?limit=0', undefined, /at least 1/],
    // A week around these would leave the years the database stores: a 400, not a 500.
    ['GET', '/api/retrospectives/period?date=0001-01-01', undefined, /between 1900 and 9998/],
    ['GET', '/api/retrospectives/period?date=9999-12-31', undefined, /between 1900 and 9998/],
    ['PUT', '/api/retrospectives/monthly/9999-12-01', { body: '회고' }, /between 1900 and 9998/],
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
      assert.equal(gone.data.error, 'Retrospective not found');
    },
    { today: () => '2026-10-23' },
  );
});
