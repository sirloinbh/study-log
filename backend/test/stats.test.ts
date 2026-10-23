import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import {
  addDays,
  bucket,
  heatmapStart,
  heatmapWeeks,
  maxSeriesDays,
  periodStart,
  weekStart,
} from '../src/stats.js';
import { withApi } from './helpers.js';

test('weeks start on Sunday (#96)', () => {
  // 2026-10-23 is a Friday; 2026-10-18 and 2026-10-25 are Sundays; 2026-10-24 a Saturday.
  assert.equal(weekStart('2026-10-23'), '2026-10-18');
  assert.equal(weekStart('2026-10-18'), '2026-10-18');
  assert.equal(weekStart('2026-10-24'), '2026-10-18');
  assert.equal(weekStart('2026-10-25'), '2026-10-25');
  assert.equal(weekStart('2027-01-01'), '2026-12-27');
});

test('period starts follow the service calendar (#47)', () => {
  assert.equal(periodStart('week', '2026-10-23'), '2026-10-18');
  assert.equal(periodStart('month', '2026-10-23'), '2026-10-01');
  // Three months back from the 23rd, the next day: 10-23 spans 07-24 to 10-23.
  assert.equal(periodStart('3months', '2026-10-23'), '2026-07-24');
  // A day missing three months back counts as that month's last day.
  assert.equal(periodStart('3months', '2026-05-31'), '2026-03-01');
  assert.equal(periodStart('3months', '2096-05-31'), '2096-03-01');
  assert.equal(periodStart('3months', '2027-01-15'), '2026-10-16');
  // All time starts at the first counted log, or today without any (or with a later one).
  assert.equal(periodStart('all', '2026-10-23', '2025-03-01'), '2025-03-01');
  assert.equal(periodStart('all', '2026-10-23'), '2026-10-23');
  assert.equal(periodStart('all', '2026-10-23', '2026-12-01'), '2026-10-23');
  // A log from long ago does not stretch the series past about ten years (security review).
  const capped = periodStart('all', '2026-10-23', '0001-01-01');
  assert.equal(capped, addDays('2026-10-23', -(maxSeriesDays - 1)));
  assert.equal(capped, '2016-10-23');
  assert.equal(periodStart('all', '2026-10-23', '2016-10-24'), '2016-10-24');
});

test('days add across month and year ends', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2096-03-01', -1), '2096-02-29');
});

test('daily minutes are summed by key in order', () => {
  const daily = [
    { date: '2026-10-18', minutes: 10 },
    { date: '2026-10-19', minutes: 20 },
    { date: '2026-10-25', minutes: 30 },
    { date: '2026-11-01', minutes: 40 },
  ];
  // Sundays 10-18, 10-25 and 11-01 each open a week.
  assert.deepEqual(bucket(daily, weekStart), [
    { key: '2026-10-18', minutes: 30 },
    { key: '2026-10-25', minutes: 30 },
    { key: '2026-11-01', minutes: 40 },
  ]);
  assert.deepEqual(
    bucket(daily, (date) => date.slice(0, 7)),
    [
      { key: '2026-10', minutes: 60 },
      { key: '2026-11', minutes: 40 },
    ],
  );
});

test('an unknown period is a Korean 400 before touching the DB', async () => {
  const untouchedPool = {
    query: async () => {
      throw new Error('DB must not be queried for invalid input');
    },
  } as unknown as Pool;
  await withApi(untouchedPool, async (call) => {
    const { status, data } = await call('/api/stats/study-time?period=year');
    assert.equal(status, 400);
    assert.match(String(data.error), /기간은 이번 주, 이번 달, 최근 3개월, 전체 중에서 고르세요/);
  });
});

test('without any logs the totals are zero and averages do not divide by zero', async () => {
  const pool = {
    query: async (sql: string, params: string[]) =>
      sql.includes('generate_series')
        ? { rows: [{ date: params[0], minutes: 0 }] }
        : { rows: [{ first: null, cumulative: 0 }] },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/stats/study-time?period=all');
      assert.equal(status, 200);
      assert.equal(data.from, '2026-10-23');
      assert.equal(data.totalMinutes, 0);
      assert.equal(data.averageMinutesPerDay, 0);
      assert.equal(data.averageMinutesPerStudyDay, 0);
    },
    { today: () => '2026-10-23' },
  );
});

test('the heatmap starts on the Sunday 52 weeks before this week (#50, #96)', () => {
  // Friday 2026-10-23: this week starts Sunday 10-18; 52 weeks earlier is 2025-10-19.
  assert.equal(heatmapWeeks, 53);
  assert.equal(heatmapStart('2026-10-23'), '2025-10-19');
  assert.equal(weekStart(heatmapStart('2026-10-23')), '2025-10-19');
  // On a Sunday the current week is one day long; still 53 columns.
  assert.equal(heatmapStart('2026-10-18'), '2025-10-19');
});
