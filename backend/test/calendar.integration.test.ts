import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Day = { date: string; minutes: number; logs: number };

// #17. Requires a dedicated test DB with database/migrations applied. Skipped (not passed)
// without it. Uses 2100: after every period the stats tests count (up to 2096-05-16) and apart from the
// dates other files use (2097, 2099, 9999).
test(
  'the calendar sums each day of a month and keeps logs inside their month',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const cleanup = () =>
      pool.query("DELETE FROM study_logs WHERE study_date BETWEEN '2100-01-01' AND '2100-12-31'");
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
        await add('2100-04-30', '09:00', '10:00'); // last day of the month before
        await add('2100-05-01', '23:00', '01:00'); // past midnight: still the 1st
        await add('2100-05-10', '09:00', '09:45');
        await add('2100-05-10', '20:00', '21:00', 'planned'); // counted as a log, not as time
        await add('2100-05-31', '07:00', '07:30', 'stopped');
        await add('2100-06-01', '09:00', '10:00'); // first day of the next month

        const month = async (value?: string) =>
          (await call(`/api/study-logs/calendar${value ? `?month=${value}` : ''}`)).data as {
            month: string;
            days: Day[];
          };
        const may = await month('2100-05');
        assert.equal(may.month, '2100-05');
        assert.equal(may.days.length, 31);
        assert.deepEqual(may.days[0], { date: '2100-05-01', minutes: 120, logs: 1 });
        assert.deepEqual(may.days[9], { date: '2100-05-10', minutes: 45, logs: 2 });
        assert.deepEqual(may.days[30], { date: '2100-05-31', minutes: 30, logs: 1 });
        // Nothing of April or June leaks in.
        assert.equal(
          may.days.reduce((sum, day) => sum + day.minutes, 0),
          195,
        );
        assert.equal(may.days.filter((day) => day.logs > 0).length, 3);

        assert.equal((await month('2100-04')).days.at(-1)?.minutes, 60);
        assert.equal((await month('2100-06')).days[0].minutes, 60);
        // February of 2100, not a leap year, and the default month from today.
        assert.equal((await month('2100-02')).days.length, 28);
        assert.equal((await month()).month, '2100-05');
      },
      { today: () => '2100-05-20' },
    );
  },
);
