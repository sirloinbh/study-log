import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';

import { auditChange } from './audit-log.js';
import { syncFirstReview } from './reviews.js';
import { inTransaction } from './sql.js';

// The seconds studied so far: the time since the start (up to the pause, when paused) minus the
// paused time already added up. All in the database clock, so every tab sees the same value.
const timerColumns = `
  started_at AS "startedAt",
  paused_at IS NOT NULL AS paused,
  GREATEST(0, floor(extract(epoch FROM (COALESCE(paused_at, now()) - started_at)))::int
    - paused_seconds) AS "elapsedSeconds"`;

const noTimer = { error: 'No timer is running' };
const running = { error: 'A timer is already running' };
const paused = { error: 'The timer is already paused' };
const notPaused = { error: 'The timer is not paused' };
const tooShort = {
  error: 'The session is under a minute. Keep studying, or cancel the timer',
};
const tooLong = {
  error: 'The session is longer than 23 h 59 min. Cancel the timer and add the study log by hand',
};

async function current(db: Pick<Pool | PoolClient, 'query'>, lock = false) {
  const { rows } = await db.query(
    `SELECT ${timerColumns} FROM study_timer WHERE id = 1${lock ? ' FOR UPDATE' : ''}`,
  );
  return rows[0] as { startedAt: string; paused: boolean; elapsedSeconds: number } | undefined;
}

// /api/study-timer (#360): start, pause, resume and stop one timer. Stopping creates a done study
// log (with its first review) on the day the timer started, from the start time to the stop time
// (or to the pause, when stopped while paused), with the paused time left out of the duration.
export function studyTimerRoutes(pool: Pool) {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ timer: (await current(pool)) ?? null });
  });

  router.post('/start', async (req, res) => {
    const result = await inTransaction(pool, async (client) => {
      const { rowCount } = await client.query(
        'INSERT INTO study_timer (id) VALUES (1) ON CONFLICT (id) DO NOTHING',
      );
      if (rowCount === 0) return undefined;
      await auditChange(req, res, client, 'create', 'study_timer', 1, {});
      return current(client);
    });
    if (!result) return void res.status(409).json(running);
    res.status(201).json({ timer: result });
  });

  router.post('/pause', async (req, res) => {
    const result = await inTransaction(pool, async (client) => {
      const timer = await current(client, true);
      if (!timer) return noTimer;
      if (timer.paused) return paused;
      await client.query('UPDATE study_timer SET paused_at = now() WHERE id = 1');
      await auditChange(req, res, client, 'update', 'study_timer', 1, { paused: true });
      return { timer: await current(client) };
    });
    if ('error' in result) return void res.status(409).json(result);
    res.json(result);
  });

  router.post('/resume', async (req, res) => {
    const result = await inTransaction(pool, async (client) => {
      const timer = await current(client, true);
      if (!timer) return noTimer;
      if (!timer.paused) return notPaused;
      await client.query(
        `UPDATE study_timer
         SET paused_seconds = paused_seconds + floor(extract(epoch FROM (now() - paused_at)))::int,
             paused_at = NULL
         WHERE id = 1`,
      );
      await auditChange(req, res, client, 'update', 'study_timer', 1, { paused: false });
      return { timer: await current(client) };
    });
    if ('error' in result) return void res.status(409).json(result);
    res.json(result);
  });

  router.post('/stop', async (req, res) => {
    const result = await inTransaction(pool, async (client) => {
      const timer = await current(client, true);
      if (!timer) return { status: 404, body: noTimer };
      const minutes = Math.round(timer.elapsedSeconds / 60);
      if (minutes < 1) return { status: 400, body: tooShort };
      if (minutes > 1439) return { status: 400, body: tooLong };
      const { rows } = await client.query(
        `INSERT INTO study_logs (study_date, start_time, end_time, duration_minutes, status, study_type)
         SELECT to_char(started_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')::date,
                to_char(started_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI')::time,
                to_char(COALESCE(paused_at, now()) AT TIME ZONE 'Asia/Seoul', 'HH24:MI')::time,
                $1, 'done', 'new'
         FROM study_timer WHERE id = 1
         RETURNING id, to_char(study_date, 'YYYY-MM-DD') AS "studyDate"`,
        [minutes],
      );
      const { id, studyDate } = rows[0] as { id: number; studyDate: string };
      await client.query('DELETE FROM study_timer WHERE id = 1');
      await syncFirstReview(client, id, undefined, { status: 'done', studyDate });
      await auditChange(req, res, client, 'create', 'study_log', id, {
        studyDate,
        status: 'done',
        source: 'timer',
      });
      return { status: 201, body: { studyLogId: id, studyDate, minutes } };
    });
    res.status(result.status).json(result.body);
  });

  router.delete('/', async (req, res) => {
    const removed = await inTransaction(pool, async (client) => {
      const { rowCount } = await client.query('DELETE FROM study_timer WHERE id = 1');
      if (rowCount === 0) return false;
      await auditChange(req, res, client, 'delete', 'study_timer', 1, {});
      return true;
    });
    if (!removed) return void res.status(404).json(noTimer);
    res.status(204).end();
  });

  return router;
}
