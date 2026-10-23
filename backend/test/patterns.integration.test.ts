import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Pattern = {
  from: string;
  to: string;
  totalMinutes: number;
  byHour: number[];
  byWeekday: number[];
  topHour: number | null;
  topWeekday: number | null;
};

// #20. Requires a dedicated test DB with database/migrations applied. Skipped (not passed)
// without it. Uses 2103, a year no other test file writes study logs to.
// 2103-03-04 is a Sunday and 2103-03-07 a Wednesday.
test(
  'study patterns sum hours and weekdays against the real database',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const cleanup = () =>
      pool.query("DELETE FROM study_logs WHERE study_date BETWEEN '2103-01-01' AND '2103-12-31'");
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const add = (studyDate: string, startTime: string, endTime: string, status = 'done') =>
        call('/api/study-logs', {
          method: 'POST',
          body: { studyDate, startTime, endTime, status },
        });
      await add('2103-03-04', '20:30', '22:00'); // Sunday: 30 at 20h, 60 at 21h
      await add('2103-03-07', '23:30', '01:00'); // Wednesday past midnight: 30 at 23h, 60 at 0h
      await add('2103-03-07', '21:00', '21:45'); // Wednesday: 45 at 21h
      await add('2103-03-07', '09:00', '12:00', 'planned'); // not studied
      await add('2103-04-01', '09:00', '10:00'); // outside the asked range

      const pattern = (await call('/api/stats/patterns?from=2103-03-01&to=2103-03-31'))
        .data as Pattern;
      assert.deepEqual(
        [pattern.from, pattern.to, pattern.totalMinutes],
        ['2103-03-01', '2103-03-31', 225],
      );
      assert.deepEqual(
        [
          pattern.byHour[0],
          pattern.byHour[20],
          pattern.byHour[21],
          pattern.byHour[23],
          pattern.byHour[9],
        ],
        [60, 30, 105, 30, 0],
      );
      assert.deepEqual(pattern.byWeekday, [90, 0, 0, 135, 0, 0, 0]);
      assert.equal(pattern.topHour, 21);
      assert.equal(pattern.topWeekday, 3);

      const empty = (await call('/api/stats/patterns?from=2103-06-01&to=2103-06-30'))
        .data as Pattern;
      assert.deepEqual([empty.totalMinutes, empty.topHour, empty.topWeekday], [0, null, null]);
    });
  },
);
