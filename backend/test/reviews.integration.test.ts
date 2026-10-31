import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Round = { round: number; due: string; original: string; completed: string | null };

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test('saving a study log keeps its first review in step', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  // A year no other test uses keeps these rows apart while test files run in parallel.
  const year = '8042';
  const cleanup = () =>
    pool.query(`DELETE FROM study_logs WHERE to_char(study_date, 'YYYY') = $1`, [year]);
  await cleanup();
  t.after(async () => {
    await cleanup();
    await pool.end();
  });

  const body = (status: string, studyDate = `${year}-03-10`, memo = '') => ({
    studyDate,
    startTime: '09:00',
    endTime: '10:00',
    memo,
    status,
  });
  const rounds = async (id: number) => {
    const { rows } = await pool.query<Round>(
      `SELECT round, due_date AS due, original_due_date AS original, completed_on AS completed
       FROM reviews WHERE study_log_id = $1 ORDER BY round`,
      [id],
    );
    return rows;
  };
  const first = (due: string, original = due): Round[] => [
    { round: 1, due, original, completed: null },
  ];

  await withApi(pool, async (call) => {
    const create = async (status: string) => {
      const created = await call('/api/study-logs', { method: 'POST', body: body(status) });
      assert.equal(created.status, 201);
      return (created.data.studyLog as { id: number }).id;
    };
    const save = async (id: number, next: ReturnType<typeof body>) => {
      const saved = await call(`/api/study-logs/${id}`, { method: 'PUT', body: next });
      assert.equal(saved.status, 200);
      assert.equal((saved.data.studyLog as { status: string }).status, next.status);
    };

    await t.test('a log created as done gets round 1 the day after its study date', async () => {
      assert.deepEqual(await rounds(await create('done')), first(`${year}-03-11`));
    });

    await t.test('a log becoming done gets round 1, and only once', async () => {
      const id = await create('in_progress');
      assert.deepEqual(await rounds(id), []);
      await save(id, body('done'));
      assert.deepEqual(await rounds(id), first(`${year}-03-11`));
      await save(id, body('done', undefined, '메모만 수정'));
      assert.deepEqual(await rounds(id), first(`${year}-03-11`));
    });

    await t.test('concurrent saves to done still leave one round', async () => {
      const id = await create('planned');
      await Promise.all([save(id, body('done')), save(id, body('done')), save(id, body('done'))]);
      assert.deepEqual(await rounds(id), first(`${year}-03-11`));
    });

    await t.test('a save waits for the row lock and acts on the status it then finds', async () => {
      const id = await create('planned');
      const other = await pool.connect();
      try {
        await other.query('BEGIN');
        await other.query('SELECT 1 FROM study_logs WHERE id = $1 FOR UPDATE', [id]);
        const saving = save(id, body('done'));
        // The save is stuck on its own locking read, not on the UPDATE after it.
        let waiting = false;
        for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
          const { rows } = await pool.query<{ waiting: boolean }>(
            `SELECT count(*) > 0 AS waiting FROM pg_stat_activity
             WHERE wait_event_type = 'Lock' AND query LIKE 'SELECT status, study_date%FOR UPDATE'`,
          );
          waiting = rows[0].waiting;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.ok(waiting, 'the save should wait on the locking read');
        // Another save got there first: already done, so this one must not create a round.
        await other.query(`UPDATE study_logs SET status = 'done' WHERE id = $1`, [id]);
        await other.query('COMMIT');
        await saving;
        assert.deepEqual(await rounds(id), []);
      } finally {
        await other.query('ROLLBACK');
        other.release();
      }
    });

    await t.test('an edit that keeps the study date leaves a snoozed date alone', async () => {
      const id = await create('done');
      await pool.query('UPDATE reviews SET due_date = $2 WHERE study_log_id = $1', [
        id,
        `${year}-04-01`,
      ]);
      await save(id, body('done', undefined, '메모만 수정'));
      assert.deepEqual(await rounds(id), first(`${year}-04-01`, `${year}-03-11`));
    });

    await t.test('changing the study date leaves a completed round 1 alone', async () => {
      const id = await create('done');
      await pool.query('UPDATE reviews SET completed_on = $2 WHERE study_log_id = $1', [
        id,
        `${year}-03-12`,
      ]);
      await save(id, body('done', `${year}-09-01`));
      assert.deepEqual(await rounds(id), [
        {
          round: 1,
          due: `${year}-03-11`,
          original: `${year}-03-11`,
          completed: `${year}-03-12`,
        },
      ]);
    });

    await t.test('undoing done removes an uncompleted round 1; done again recreates', async () => {
      const id = await create('done');
      await save(id, body('stopped', `${year}-03-20`));
      assert.deepEqual(await rounds(id), []);
      await save(id, body('done', `${year}-03-20`));
      assert.deepEqual(await rounds(id), first(`${year}-03-21`));
    });

    await t.test('a completed round survives undoing and redoing done', async () => {
      const id = await create('done');
      await pool.query('UPDATE reviews SET completed_on = $2 WHERE study_log_id = $1', [
        id,
        `${year}-03-12`,
      ]);
      const kept: Round[] = [
        {
          round: 1,
          due: `${year}-03-11`,
          original: `${year}-03-11`,
          completed: `${year}-03-12`,
        },
      ];
      await save(id, body('planned'));
      assert.deepEqual(await rounds(id), kept);
      await save(id, body('done', `${year}-05-01`));
      assert.deepEqual(await rounds(id), kept);
    });

    await t.test('changing the study date recalculates an uncompleted round 1', async () => {
      const id = await create('done');
      await pool.query('UPDATE reviews SET due_date = $2 WHERE study_log_id = $1', [
        id,
        `${year}-04-01`,
      ]);
      await save(id, body('done', `${year}-06-01`));
      assert.deepEqual(await rounds(id), first(`${year}-06-02`));
    });

    await t.test('a log already done without reviews gets none from an edit', async () => {
      const id = await create('done');
      await pool.query('DELETE FROM reviews WHERE study_log_id = $1', [id]);
      await save(id, body('done', `${year}-07-01`, '오래된 기록'));
      assert.deepEqual(await rounds(id), []);
    });

    await t.test('deleting a log deletes its reviews', async () => {
      const id = await create('done');
      assert.equal((await call(`/api/study-logs/${id}`, { method: 'DELETE' })).status, 204);
      assert.deepEqual(await rounds(id), []);
    });

    await t.test('a reference that does not exist saves neither the log nor a review', async () => {
      const id = await create('planned');
      const failed = await call(`/api/study-logs/${id}`, {
        method: 'PUT',
        body: { ...body('done'), textbookId: 999_999_999_999_999 },
      });
      assert.equal(failed.status, 400);
      assert.equal(failed.data.error, '교재를 찾을 수 없습니다');
      assert.deepEqual(await rounds(id), []);
      const kept = await call(`/api/study-logs/${id}`);
      assert.equal((kept.data.studyLog as { status: string }).status, 'planned');

      const marker = '저장되면 안 되는 기록';
      const rejected = await call('/api/study-logs', {
        method: 'POST',
        body: { ...body('done', undefined, marker), textbookId: 999_999_999_999_999 },
      });
      assert.equal(rejected.status, 400);
      const { rowCount } = await pool.query('SELECT 1 FROM study_logs WHERE memo = $1', [marker]);
      assert.equal(rowCount, 0);
    });

    await t.test('saving a log that does not exist answers 404', async () => {
      const missing = await call('/api/study-logs/999999999999998', {
        method: 'PUT',
        body: body('done'),
      });
      assert.equal(missing.status, 404);
    });
  });
});
