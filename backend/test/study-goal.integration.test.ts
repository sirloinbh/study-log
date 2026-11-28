import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Goal = {
  date: string;
  goalMinutes: number;
  studiedMinutes: number;
  achievementRate: number;
  streakDays: number;
  studiedToday: boolean;
};

test('the goal can no longer be set', async () => {
  const untouchedPool = {
    query: async () => {
      throw new Error('DB must not be queried');
    },
  } as unknown as Pool;
  await withApi(untouchedPool, async (call) => {
    const { status } = await call('/api/stats/goal', { method: 'PUT', body: { minutes: 60 } });
    assert.equal(status, 404);
  });
});

// #361, #479. Requires a dedicated test DB with database/migrations applied. Skipped (not passed)
// without it. Uses June 2098, apart from the dates other files use. "Today" is Tuesday 2098-06-17.
test('the daily goal, achievement rate and streak of study days', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const cleanup = () =>
    pool.query("DELETE FROM study_logs WHERE study_date BETWEEN '2098-06-01' AND '2098-06-30'");
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
      await add('2098-06-15', '09:00', '10:00');
      await add('2098-06-16', '09:00', '10:30');
      await add('2098-06-17', '20:00', '21:00', 'planned'); // today: planned does not count

      const get = async () => (await call('/api/stats/goal')).data as unknown as Goal;
      const before = await get();
      assert.equal(before.date, '2098-06-17');
      assert.equal(before.goalMinutes, 120);
      assert.equal(before.studiedMinutes, 0);
      assert.equal(before.achievementRate, 0);
      // Today has only a plan, so the streak runs to yesterday: the 15th and the 16th.
      assert.equal(before.streakDays, 2);
      assert.equal(before.studiedToday, false);

      // A done log today joins the streak and counts toward today's goal only.
      await add('2098-06-17', '07:00', '08:00');
      const today = await get();
      assert.equal(today.streakDays, 3);
      assert.equal(today.studiedToday, true);
      assert.equal(today.studiedMinutes, 60);
      assert.equal(today.achievementRate, 50);

      await add('2098-06-17', '09:00', '11:00');
      assert.equal((await get()).achievementRate, 175);
    },
    { today: () => '2098-06-17' },
  );

  // The goal is the same on any other day, a weekend included; the streak is over after a gap.
  await withApi(
    pool,
    async (call) => {
      const next = (await call('/api/stats/goal')).data as unknown as Goal;
      assert.equal(next.date, '2098-06-20');
      assert.equal(next.goalMinutes, 120);
      assert.equal(next.studiedMinutes, 0);
      assert.equal(next.streakDays, 0);
    },
    { today: () => '2098-06-20' },
  );
});
