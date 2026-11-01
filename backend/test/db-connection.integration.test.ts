import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createPool, inTransaction } from '../src/sql.js';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// #133. Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without
// it. Each test really ends a backend connection; an unhandled `error` event would end this process
// and fail the file.
test('losing database connections never ends the process', { skip: !url }, async (t) => {
  const admin = new Pool({ connectionString: url });
  const pool = createPool(url);
  const original = console.error;
  const logged: string[] = [];
  console.error = (...args: unknown[]) => void logged.push(args.join(' '));
  const year = '8045';
  const cleanup = () =>
    admin.query(`DELETE FROM study_logs WHERE to_char(study_date, 'YYYY') = $1`, [year]);
  t.after(async () => {
    console.error = original;
    await cleanup();
    await pool.end();
    await admin.end();
  });
  await cleanup();

  const kill = (pid: number) => admin.query('SELECT pg_terminate_backend($1)', [pid]);
  const pidOf = async (query: (sql: string) => Promise<{ rows: unknown[] }>) =>
    ((await query('SELECT pg_backend_pid() AS pid')).rows[0] as { pid: number }).pid;
  const works = async () => {
    const { rows } = await pool.query('SELECT 1 AS one');
    assert.deepEqual(rows, [{ one: 1 }]);
  };

  await t.test('an idle connection lost: logged once, and the next query works', async () => {
    logged.length = 0;
    await kill(await pidOf((sql) => pool.query(sql)));
    // The pool drops the connection when it hears of the loss; until then a query could still get it.
    for (let attempt = 0; attempt < 200 && pool.totalCount > 0; attempt++) await sleep(25);
    assert.equal(pool.totalCount, 0, 'the pool should drop the lost connection');
    await works();
    const entries = logged.filter((line) => line.includes('db_connection_error'));
    assert.equal(entries.length, 1, logged.join('\n'));
    // Only these two fields, so nothing about the connection can reach the log with it.
    assert.deepEqual(Object.keys(JSON.parse(entries[0]) as object), ['event', 'message']);
    assert.ok(!entries[0].includes(url!), 'the log does not repeat the connection string');
  });

  await t.test('a connection lost between queries of a transaction: it rejects', async () => {
    await assert.rejects(
      inTransaction(pool, async (client) => {
        await kill(await pidOf((sql) => client.query(sql)));
        await sleep(200);
        await client.query('SELECT 1');
      }),
    );
    await works();
  });

  await t.test('a connection lost during a request: a Korean 500, then normal', async () => {
    await withApi(pool, async (call) => {
      const created = await call('/api/study-logs', {
        method: 'POST',
        body: { studyDate: `${year}-01-01`, startTime: '09:00', endTime: '10:00' },
      });
      // console.error is captured above, so a failure here shows what the server logged.
      assert.equal(created.status, 201, logged.join('\n'));
      const { id } = created.data.studyLog as { id: number };

      // The save waits on this row lock, so its connection can be found and ended mid-request.
      const holder = await admin.connect();
      try {
        await holder.query('BEGIN');
        await holder.query('SELECT 1 FROM study_logs WHERE id = $1 FOR UPDATE', [id]);
        const holderPid = await pidOf((sql) => holder.query(sql));
        const saving = call(`/api/study-logs/${id}`, {
          method: 'PUT',
          body: { studyDate: `${year}-01-02`, startTime: '09:00', endTime: '10:00' },
        });
        let waiting: number | undefined;
        for (let attempt = 0; attempt < 100 && waiting === undefined; attempt++) {
          const { rows } = await admin.query<{ pid: number }>(
            'SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
            [holderPid],
          );
          waiting = rows[0]?.pid;
          if (waiting === undefined) await sleep(50);
        }
        assert.ok(waiting, 'the save should wait for the row lock');
        await kill(waiting);
        const { status, data } = await saving;
        assert.equal(status, 500);
        assert.equal(data.error, '서버 오류가 발생했습니다');
      } finally {
        await holder.query('ROLLBACK');
        holder.release();
      }

      const after = await call(`/api/study-logs/${id}`);
      assert.equal(after.status, 200);
      assert.equal((after.data.studyLog as { studyDate: string }).studyDate, `${year}-01-01`);
      assert.equal((await call('/api/health')).status, 200);
    });
  });
});
