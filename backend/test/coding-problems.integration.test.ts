import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Json = Record<string, unknown>;

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'problems keep many attempts, filter by site and result, and can add a study log',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const day = '2098-06-01';
    const cleanup = async () => {
      await pool.query(`DELETE FROM coding_problems WHERE problem_key IN ('9998', 'zz-test-slug')`);
      await pool.query(`DELETE FROM study_logs WHERE study_date = $1`, [day]);
    };
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const made = await call('/api/coding/problems', {
        method: 'POST',
        body: {
          site: 'baekjoon',
          problemKey: '9998',
          title: 'Test sum',
          attempt: { date: day, result: 'failed', language: 'Python', notes: 'timeout' },
        },
      });
      assert.equal(made.status, 201);
      const problem = made.data.problem as Json;
      assert.equal(problem.url, 'https://www.acmicpc.net/problem/9998');
      assert.equal((made.data.attempts as unknown[]).length, 1);

      const again = await call('/api/coding/problems', {
        method: 'POST',
        body: { site: 'baekjoon', problemKey: '9998', title: 'Test sum' },
      });
      assert.equal(again.status, 409, 'the same site and ID is one problem');

      // A second try, with a study log of the same day (the form's checkbox).
      const second = await call(`/api/coding/problems/${problem.id}/attempts`, {
        method: 'POST',
        body: {
          date: day,
          result: 'solved',
          minutes: 45,
          studyLog: { startTime: '23:30' },
        },
      });
      assert.equal(second.status, 201);
      const attempt = second.data.attempt as Json;
      assert.ok(attempt.studyLogId, 'the study log was made');
      const logs = await pool.query(
        `SELECT duration_minutes, to_char(end_time, 'HH24:MI') AS "end", status FROM study_logs
         WHERE id = $1`,
        [attempt.studyLogId],
      );
      assert.deepEqual(logs.rows[0], { duration_minutes: 45, end: '00:15', status: 'done' });
      const reviews = await pool.query('SELECT 1 FROM reviews WHERE study_log_id = $1', [
        attempt.studyLogId,
      ]);
      assert.equal(reviews.rowCount, 1, 'a done log gets its first review');

      const list = async (query: string) =>
        ((await call(`/api/coding/problems?${query}`)).data.problems as Json[]).filter(
          (row) => row.problemKey === '9998',
        );
      const [row] = await list('site=baekjoon');
      assert.equal(row.attemptCount, 2);
      assert.equal(row.totalMinutes, 45);
      assert.equal(row.lastResult, 'solved');
      assert.equal((await list('site=leetcode')).length, 0);
      assert.equal((await list('result=failed')).length, 0, 'the latest attempt decides');
      assert.equal((await list('result=solved&q=sum')).length, 1);

      // Edit the attempt, keep its date when none is sent, then delete the problem.
      const edited = await call(`/api/coding/attempts/${attempt.id}`, {
        method: 'PUT',
        body: { result: 'partial', minutes: 50 },
      });
      assert.equal(edited.status, 200);
      assert.equal((edited.data.attempt as Json).date, day);
      assert.equal(
        (await call('/api/coding/attempts/999999999', { method: 'DELETE' })).status,
        404,
      );

      const detail = await call(`/api/coding/problems/${problem.id}`);
      assert.equal((detail.data.attempts as unknown[]).length, 2);
      assert.equal(
        (await call(`/api/coding/problems/${problem.id}`, { method: 'DELETE' })).status,
        204,
      );
      assert.equal((await call(`/api/coding/problems/${problem.id}`)).status, 404);
      const kept = await pool.query('SELECT 1 FROM study_logs WHERE id = $1', [attempt.studyLogId]);
      assert.equal(kept.rowCount, 1, 'the study log stays');

      const audits = await pool.query(
        `SELECT DISTINCT entity FROM audit_log WHERE entity LIKE 'coding_%'`,
      );
      assert.ok(audits.rowCount && audits.rowCount >= 2, 'changes leave audit rows');
    });
  },
);
