import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Log = {
  id: number;
  understanding: number | null;
  difficulties: string;
  goalAchieved: boolean | null;
};

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'study logs keep the self-assessment and the database enforces its range',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    // A far-future date keeps these rows apart from anything else in the test DB.
    const day = '2099-03-10';
    const cleanup = () => pool.query('DELETE FROM study_logs WHERE study_date = $1', [day]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const session = { studyDate: day, startTime: '09:00', endTime: '10:00' };
      const created = await call('/api/study-logs', {
        method: 'POST',
        body: { ...session, understanding: 4, difficulties: '고유값 분해', goalAchieved: false },
      });
      assert.equal(created.status, 201);
      const log = created.data.studyLog as Log;
      assert.deepEqual(
        [log.understanding, log.difficulties, log.goalAchieved],
        [4, '고유값 분해', false],
      );

      // Read back through the list and the single log.
      const listed = (await call(`/api/study-logs?date=${day}`)).data.studyLogs as Log[];
      assert.deepEqual(
        listed.map((item) => [item.understanding, item.goalAchieved]),
        [[4, false]],
      );

      // Clearing the answers stores NULL and an empty text again.
      const cleared = await call(`/api/study-logs/${log.id}`, { method: 'PUT', body: session });
      assert.equal(cleared.status, 200);
      const fetched = (await call(`/api/study-logs/${log.id}`)).data.studyLog as Log;
      assert.deepEqual(
        [fetched.understanding, fetched.difficulties, fetched.goalAchieved],
        [null, '', null],
      );

      // The database itself keeps understanding within 1-5 and the text within 2000 characters.
      for (const [column, value] of [
        ['understanding', 6],
        ['understanding', 0],
        ['difficulties', 'x'.repeat(2001)],
      ] as const) {
        await assert.rejects(
          pool.query(
            `INSERT INTO study_logs (study_date, start_time, end_time, duration_minutes, ${column})
             VALUES ($1, '09:00', '10:00', 60, $2)`,
            [day, value],
          ),
          { code: '23514' },
          `${column} ${String(value).slice(0, 10)}`,
        );
      }
    });
  },
);
