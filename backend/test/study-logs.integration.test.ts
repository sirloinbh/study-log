import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'study logs are created, listed, updated and deleted against the real database',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    // The last possible date keeps these rows apart from anything else in the test DB, and keeps
    // them the most recent while other test files add logs in parallel (?limit=1 below).
    const day = '9999-12-31';
    const cleanup = () => pool.query('DELETE FROM study_logs WHERE study_date = $1', [day]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const night = await call('/api/study-logs', {
        method: 'POST',
        body: {
          studyDate: day,
          startTime: '23:00',
          endTime: '01:00',
          memo: '선형대수 2장',
          status: 'done',
        },
      });
      assert.equal(night.status, 201);
      assert.deepEqual(
        { ...(night.data.studyLog as object), id: 0 },
        {
          id: 0,
          studyDate: day,
          startTime: '23:00',
          endTime: '01:00',
          durationMinutes: 120,
          memo: '선형대수 2장',
          status: 'done',
          textbookId: null,
          textbookTitle: null,
          contentId: null,
          contentNumber: null,
          contentTitle: null,
          understanding: null,
          difficulties: '',
          goalAchieved: null,
        },
      );

      const morning = await call('/api/study-logs', {
        method: 'POST',
        body: { studyDate: day, startTime: '09:00', endTime: '09:45' },
      });
      const morningLog = morning.data.studyLog as { id: number; status: string; memo: string };
      assert.equal(morningLog.status, 'planned');
      assert.equal(morningLog.memo, '');

      const listed = await call(`/api/study-logs?date=${day}`);
      const logs = listed.data.studyLogs as { startTime: string }[];
      assert.deepEqual(
        logs.map((log) => log.startTime),
        ['09:00', '23:00'],
        'same day in time order',
      );

      const recent = await call('/api/study-logs?limit=1');
      assert.equal(
        (recent.data.studyLogs as { id: number }[])[0].id,
        (night.data.studyLog as { id: number }).id,
      );

      const updated = await call(`/api/study-logs/${morningLog.id}`, {
        method: 'PUT',
        body: {
          studyDate: day,
          startTime: '09:00',
          endTime: '11:00',
          memo: '복습',
          status: 'in_progress',
        },
      });
      assert.equal(updated.status, 200);
      assert.equal((updated.data.studyLog as { durationMinutes: number }).durationMinutes, 120);
      const fetched = await call(`/api/study-logs/${morningLog.id}`);
      assert.equal((fetched.data.studyLog as { memo: string }).memo, '복습');

      assert.equal(
        (await call(`/api/study-logs/${morningLog.id}`, { method: 'DELETE' })).status,
        204,
      );
      assert.equal((await call(`/api/study-logs/${morningLog.id}`)).status, 404);
    });
  },
);
