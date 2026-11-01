import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { addDays } from '../src/stats.js';
import { holdExactTotalsLock, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

// #46. Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without
// it. An early year keeps other test files' later reviews out at this "today" (not below 100, where
// Date.UTC reads the year as 19xx; a real today is never there). The other two tests
// with early rows compare totals as well, so the three take turns.
test('review statistics follow the original due dates', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const year = '0100';
  const cleanup = () =>
    pool.query(`DELETE FROM study_logs WHERE study_date BETWEEN '0001-01-01' AND $1`, [
      `${year}-12-31`,
    ]);
  await holdExactTotalsLock(url, t, async () => {
    await cleanup();
    await pool.end();
  });
  await cleanup();

  // A Saturday in June, late enough that the whole week is in the month.
  const today = '0100-06-19';
  assert.equal(new Date(`${today}T00:00:00Z`).getUTCDay(), 6);
  const day = (days: number) => addDays(today, days);

  await withApi(
    pool,
    async (call) => {
      const stats = async (period: string) => {
        const { status, data } = await call(`/api/stats/reviews?period=${period}`);
        assert.equal(status, 200);
        return data;
      };
      // A round with this original due date, one day after its study date.
      const round = async (original: string, completedOn: string | null = null) => {
        const created = await call('/api/study-logs', {
          method: 'POST',
          body: {
            studyDate: addDays(original, -1),
            startTime: '09:00',
            endTime: '10:00',
            status: 'done',
          },
        });
        assert.equal(created.status, 201);
        const logId = (created.data.studyLog as { id: number }).id;
        const { rows } = await pool.query<{ id: number }>(
          'UPDATE reviews SET completed_on = $2 WHERE study_log_id = $1 RETURNING id',
          [logId, completedOn],
        );
        return rows[0].id;
      };

      await t.test('nothing scheduled has no rate', async () => {
        assert.deepEqual(await stats('all'), {
          period: 'all',
          from: today,
          to: today,
          scheduled: 0,
          completed: 0,
          delayed: 0,
          completionRate: null,
        });
      });

      // This week.
      await round(day(-1), day(-1)); // on time
      await round(day(-2), day(0)); // late
      await round(day(-3)); // overdue
      await round(day(0)); // due today: not late yet
      await round(day(-4), day(-5)); // early: on time
      const snoozed = await round(day(-5)); // overdue, then moved
      // Earlier this month, in the last 3 months, and only in "all".
      await round('0100-06-02', '0100-06-02');
      await round('0100-05-20', '0100-05-20');
      await round('0100-01-02');
      // Not due yet: never counted.
      await round(day(3));

      await t.test('moving a round changes nothing', async () => {
        const before = await stats('week');
        const moved = await call(`/api/reviews/${snoozed}/due-date`, {
          method: 'PUT',
          body: { dueDate: '0100-12-01' },
        });
        assert.equal(moved.status, 200);
        assert.deepEqual(await stats('week'), before);
        assert.equal(
          (await call(`/api/reviews/${snoozed}/snooze`, { method: 'POST' })).status,
          200,
        );
        assert.deepEqual(await stats('week'), before);
      });

      for (const [period, from, scheduled, completed, delayed, rate] of [
        ['week', '0100-06-13', 6, 3, 3, 50],
        ['month', '0100-06-01', 7, 4, 3, 57],
        ['3months', '0100-03-20', 8, 5, 3, 63],
        ['all', '0100-01-02', 9, 5, 4, 56],
      ] as const)
        await t.test(`${period} counts its own rounds`, async () => {
          assert.deepEqual(await stats(period), {
            period,
            from,
            to: today,
            scheduled,
            completed,
            delayed,
            completionRate: rate,
          });
        });

      await t.test('without a period it is this week', async () => {
        const { data } = await call('/api/stats/reviews');
        assert.equal(data.period, 'week');
      });

      await t.test('an unknown period answers a Korean 400', async () => {
        const { status, data } = await call('/api/stats/reviews?period=year');
        assert.equal(status, 400);
        assert.equal(data.error, '기간은 이번 주, 이번 달, 최근 3개월, 전체 중에서 고르세요');
      });
    },
    { today: () => today },
  );
});
