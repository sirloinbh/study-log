import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Goal = {
  weekStart: string;
  weekEnd: string;
  goalMinutes: number | null;
  goalSince: string | null;
  studiedMinutes: number;
  achievementRate: number | null;
  streakDays: number;
  studiedToday: boolean;
};

test('a goal must be 1 to 10080 whole minutes, checked before the database', async () => {
  const untouchedPool = {
    query: async () => {
      throw new Error('DB must not be queried for invalid input');
    },
  } as unknown as Pool;
  await withApi(untouchedPool, async (call) => {
    for (const body of [
      {},
      { minutes: 0 },
      { minutes: 10081 },
      { minutes: 1.5 },
      { minutes: '60' },
    ]) {
      const { status, data } = await call('/api/stats/goal', { method: 'PUT', body });
      assert.equal(status, 400, JSON.stringify(body));
      assert.ok(typeof data.error === 'string' && data.error.length > 0);
    }
  });
});

// #361. Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without
// it. Uses June 2098, apart from the dates other files use. "Today" is Tuesday 2098-06-17, so the
// week runs from Sunday 2098-06-15 to Saturday 2098-06-21.
test('the goal week, achievement rate and streak of study days', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const cleanup = async () => {
    await pool.query(
      "DELETE FROM study_logs WHERE study_date BETWEEN '2098-06-01' AND '2098-06-30'",
    );
    await pool.query(
      "DELETE FROM weekly_goals WHERE week_start >= '2098-06-01' AND week_start < '2098-07-01'",
    );
  };
  await cleanup();
  t.after(async () => {
    await cleanup();
    await pool.end();
  });

  await withApi(
    pool,
    async (call) => {
      const add = (studyDate: string, startTime: string, endTime: string, status = 'done') =>
        call('/api/study-logs', {
          method: 'POST',
          body: { studyDate, startTime, endTime, status },
        });
      await add('2098-06-12', '09:00', '10:00'); // Friday, then a gap on Saturday the 14th
      await add('2098-06-15', '09:00', '10:00'); // 60
      await add('2098-06-16', '09:00', '10:30'); // 90
      await add('2098-06-17', '20:00', '21:00', 'planned'); // today: planned does not count

      const get = async () => (await call('/api/stats/goal')).data as unknown as Goal;
      const before = await get();
      assert.equal(before.weekStart, '2098-06-15');
      assert.equal(before.weekEnd, '2098-06-21');
      assert.equal(before.goalMinutes, null);
      assert.equal(before.achievementRate, null);
      assert.equal(before.studiedMinutes, 150);
      // Today has only a plan, so the streak runs to yesterday: the 15th and the 16th.
      assert.equal(before.streakDays, 2);
      assert.equal(before.studiedToday, false);

      const put = await call('/api/stats/goal', { method: 'PUT', body: { minutes: 300 } });
      assert.equal(put.status, 200);
      const after = await get();
      assert.equal(after.goalMinutes, 300);
      assert.equal(after.goalSince, '2098-06-15');
      assert.equal(after.achievementRate, 50);

      // Changing it again in the same week replaces it.
      await call('/api/stats/goal', { method: 'PUT', body: { minutes: 150 } });
      assert.equal((await get()).achievementRate, 100);

      // A done log today joins the streak.
      await add('2098-06-17', '07:00', '07:30');
      const today = await get();
      assert.equal(today.streakDays, 3);
      assert.equal(today.studiedToday, true);
      assert.equal(today.studiedMinutes, 180);
      assert.equal(today.achievementRate, 120);
    },
    { today: () => '2098-06-17' },
  );

  // The next week keeps the goal until it is changed; with no study since the 17th the streak is over.
  await withApi(
    pool,
    async (call) => {
      const next = (await call('/api/stats/goal')).data as unknown as Goal;
      assert.equal(next.weekStart, '2098-06-22');
      assert.equal(next.goalMinutes, 150);
      assert.equal(next.goalSince, '2098-06-15');
      assert.equal(next.studiedMinutes, 0);
      assert.equal(next.achievementRate, 0);
      assert.equal(next.streakDays, 0);
      await call('/api/stats/goal', { method: 'PUT', body: { minutes: 600 } });
      assert.equal(((await call('/api/stats/goal')).data as unknown as Goal).goalMinutes, 600);
    },
    { today: () => '2098-06-24' },
  );

  // The earlier week still has its own goal.
  await withApi(
    pool,
    async (call) => {
      assert.equal(((await call('/api/stats/goal')).data as unknown as Goal).goalMinutes, 150);
    },
    { today: () => '2098-06-20' },
  );
});
