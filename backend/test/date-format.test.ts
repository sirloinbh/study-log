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

const schedule = {
  title: '알고리즘',
  startDate: '2026-11-02',
  endDate: '2026-11-30',
  weekdayMinutes: 120,
  restDayMinutes: 300,
};
const studyLog = { studyDate: '2026-10-21', startTime: '09:00', endTime: '10:30' };

// A date in the wrong format gets only the format message, not also "no such day" (#159), and a day
// that does not exist gets only that, not also the later range check.
test('a wrong date says one thing: its format, or that the day does not exist', async () => {
  const cases: [string, string, unknown, string][] = [
    ['POST', '/api/keywords', { keyword: '고유값', date: '2026/11/02' }, 'date'],
    ['GET', '/api/keywords?from=2026.11.02', undefined, 'date'],
    ['GET', '/api/retrospectives/period?date=20261102', undefined, 'date'],
    ['PUT', '/api/retrospectives/weekly/2026-1-02', { body: '회고' }, 'date'],
    ['PUT', '/api/reviews/1/due-date', { dueDate: '2026/11/02' }, 'due date'],
    ['POST', '/api/schedules', { ...schedule, startDate: '2026/11/02' }, 'start date'],
    ['POST', '/api/schedules', { ...schedule, endDate: '2026-11-3' }, 'end date'],
    ['PUT', '/api/schedules/1/items/1/date', { date: '11/02/2026' }, 'move date'],
    ['GET', '/api/stats/patterns?from=2026/11/02', undefined, 'start date'],
    ['GET', '/api/stats/patterns?to=2026/11/02', undefined, 'end date'],
    ['POST', '/api/study-logs', { ...studyLog, studyDate: '2026/11/02' }, 'study date'],
    ['GET', '/api/study-logs?from=2026/11/02', undefined, 'study date'],
  ];
  const noSuchDay: [string, string, unknown][] = [
    ['POST', '/api/keywords', { keyword: '고유값', date: '2026-02-30' }],
    ['GET', '/api/retrospectives/period?date=0000-01-01', undefined],
    ['PUT', '/api/reviews/1/due-date', { dueDate: '8044-02-31' }],
    ['POST', '/api/schedules', { ...schedule, endDate: '2026-11-31' }],
    ['GET', '/api/stats/patterns?from=2026-02-30', undefined],
    ['POST', '/api/study-logs', { ...studyLog, studyDate: '0000-01-01' }],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [method, path, body, label] of cases) {
      const { status, data } = await call(path, { method, body });
      assert.equal(status, 400, `${method} ${path}`);
      assert.equal(data.error, `The ${label} must be in YYYY-MM-DD format`, `${method} ${path}`);
    }
    for (const [method, path, body] of noSuchDay) {
      const { status, data } = await call(path, { method, body });
      assert.equal(status, 400, `${method} ${path}`);
      assert.equal(data.error, 'This date does not exist', `${method} ${path}`);
    }
  });
});
