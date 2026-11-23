import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Timer = { startedAt: string; paused: boolean; elapsedSeconds: number } | null;

// #360. Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without
// it. This file is the only one that touches study_timer, which holds at most one row; the study logs
// it creates are removed by id.
test('the timer starts, pauses, resumes and stops into a study log', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const created: number[] = [];
  const cleanup = async () => {
    await pool.query('DELETE FROM study_timer');
    if (created.length) await pool.query('DELETE FROM study_logs WHERE id = ANY($1)', [created]);
  };
  await cleanup();
  t.after(async () => {
    await cleanup();
    await pool.end();
  });

  await withApi(pool, async (call) => {
    const get = async () => ((await call('/api/study-timer')).data as { timer: Timer }).timer;
    const post = (action: string) => call(`/api/study-timer/${action}`, { method: 'POST' });

    assert.equal(await get(), null);
    assert.equal((await post('pause')).status, 409);
    assert.equal((await post('resume')).status, 409);
    assert.equal((await post('stop')).status, 404);
    assert.equal((await call('/api/study-timer', { method: 'DELETE' })).status, 404);

    assert.equal((await post('start')).status, 201);
    assert.equal((await post('start')).status, 409, 'only one timer at a time');
    const first = await get();
    assert.equal(first?.paused, false);
    assert.ok(first!.elapsedSeconds >= 0 && first!.elapsedSeconds < 5);

    // Under a minute: refused, the timer keeps running.
    const early = await post('stop');
    assert.equal(early.status, 400);
    assert.match(String(early.data.error), /under a minute/);
    assert.ok(await get());

    // 40 minutes since the start, 10 of them paused: 30 minutes studied. A reload (a new read) shows
    // the same time.
    await pool.query(
      "UPDATE study_timer SET started_at = now() - interval '40 minutes', paused_seconds = 600",
    );
    const running = await get();
    assert.ok(running!.elapsedSeconds >= 1800 && running!.elapsedSeconds < 1805);

    // Pausing freezes the time; resuming adds the pause to the paused total.
    assert.equal((await post('pause')).status, 200);
    assert.equal((await post('pause')).status, 409);
    await pool.query("UPDATE study_timer SET paused_at = now() - interval '5 minutes'");
    const frozen = await get();
    assert.equal(frozen?.paused, true);
    assert.ok(frozen!.elapsedSeconds >= 1500 && frozen!.elapsedSeconds < 1510);
    assert.equal((await post('resume')).status, 200);
    const resumed = await get();
    assert.equal(resumed?.paused, false);
    assert.ok(resumed!.elapsedSeconds >= 1500 && resumed!.elapsedSeconds < 1510);

    // Stop: one done study log whose duration leaves the paused time out.
    const stopped = await post('stop');
    assert.equal(stopped.status, 201);
    created.push(Number(stopped.data.studyLogId));
    assert.equal(stopped.data.minutes, 25);
    assert.equal(await get(), null);
    const log = (await call(`/api/study-logs/${stopped.data.studyLogId}`)).data.studyLog as {
      durationMinutes: number;
      status: string;
      studyType: string;
    };
    assert.equal(log.durationMinutes, 25);
    assert.equal(log.status, 'done');
    assert.equal(log.studyType, 'new');

    // Cancel leaves no study log.
    await post('start');
    assert.equal((await call('/api/study-timer', { method: 'DELETE' })).status, 204);
    assert.equal(await get(), null);
  });
});

test(
  'a timer stopped while paused ends at the pause, and a session past midnight keeps its start day',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const created: number[] = [];
    const cleanup = async () => {
      await pool.query('DELETE FROM study_timer');
      if (created.length) await pool.query('DELETE FROM study_logs WHERE id = ANY($1)', [created]);
    };
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      // 23:50 on 2098-03-01 in Seoul (14:50 UTC), paused at 00:20 on the 2nd (15:20 UTC).
      await pool.query(
        `INSERT INTO study_timer (id, started_at, paused_at, paused_seconds)
         VALUES (1, '2098-03-01 14:50:00+00', '2098-03-01 15:20:00+00', 0)`,
      );
      const stopped = await call('/api/study-timer/stop', { method: 'POST' });
      assert.equal(stopped.status, 201);
      created.push(Number(stopped.data.studyLogId));
      assert.equal(stopped.data.studyDate, '2098-03-01');
      assert.equal(stopped.data.minutes, 30);
      const log = (await call(`/api/study-logs/${stopped.data.studyLogId}`)).data.studyLog as {
        studyDate: string;
        startTime: string;
        endTime: string;
        durationMinutes: number;
      };
      assert.deepEqual(
        [log.studyDate, log.startTime, log.endTime, log.durationMinutes],
        ['2098-03-01', '23:50', '00:20', 30],
      );

      // A forgotten timer is refused, not saved as a day-long log.
      await pool.query(
        "INSERT INTO study_timer (id, started_at) VALUES (1, now() - interval '30 hours')",
      );
      const forgotten = await call('/api/study-timer/stop', { method: 'POST' });
      assert.equal(forgotten.status, 400);
      assert.match(String(forgotten.data.error), /longer than 23 h 59 min/);
    });
  },
);
