import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { codingSummary } from '../src/coding-summary.js';
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

test('importing solved.ac problems twice adds them once', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const ids = [9990001, 9990002, 9990003];
  const cleanup = () =>
    pool.query(`DELETE FROM coding_problems WHERE site = 'baekjoon' AND problem_key = ANY($1)`, [
      ids.map(String),
    ]);
  await cleanup();
  t.after(async () => {
    await cleanup();
    await pool.end();
  });
  const client = {
    problem: async () => undefined,
    solvedPage: async () => ({
      total: 3,
      items: ids.map((id) => ({ id, title: `Imported ${id}`, level: 7, tags: ['math', 'dp'] })),
    }),
  };
  await withApi(
    pool,
    async (call) => {
      // One of the three is recorded by hand first: it is skipped and left as it is.
      await call('/api/coding/problems', {
        method: 'POST',
        body: { site: 'baekjoon', problemKey: String(ids[0]), title: 'By hand' },
      });
      const first = await call('/api/coding/solvedac/import', { method: 'POST' });
      assert.deepEqual(first.data, { added: 2, skipped: 1, total: 3 });
      const second = await call('/api/coding/solvedac/import', { method: 'POST' });
      assert.deepEqual(second.data, { added: 0, skipped: 3, total: 3 });

      const { rows } = await pool.query(
        `SELECT problem_key, title, url, level, tags FROM coding_problems
         WHERE site = 'baekjoon' AND problem_key = ANY($1) ORDER BY problem_key`,
        [ids.map(String)],
      );
      assert.equal(rows.length, 3);
      assert.equal(rows[0].title, 'By hand');
      assert.deepEqual(rows[1], {
        problem_key: String(ids[1]),
        title: `Imported ${ids[1]}`,
        url: `https://www.acmicpc.net/problem/${ids[1]}`,
        level: 7,
        tags: ['math', 'dp'],
      });
      const audited = await pool.query(
        `SELECT 1 FROM audit_log WHERE entity = 'coding_problem' AND after->>'source' = 'solved.ac'`,
      );
      assert.ok(audited.rowCount && audited.rowCount >= 1, 'the import leaves an audit row');
    },
    { solvedAcClient: client, solvedAcHandle: 'some_user' },
  );
});

test('importing LeetCode submissions twice adds them once', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const slugs = ['zz-test-import-one', 'zz-test-import-two'];
  const cleanup = () =>
    pool.query(`DELETE FROM coding_problems WHERE site = 'leetcode' AND problem_key = ANY($1)`, [
      slugs,
    ]);
  await cleanup();
  t.after(async () => {
    await cleanup();
    await pool.end();
  });
  const client = {
    recentAccepted: async () => [
      { slug: slugs[0], title: 'Import one', timestamp: 1700004600 },
      { slug: slugs[1], title: 'Import two', timestamp: 1700100000 },
    ],
    difficulty: async () => 'Hard' as const,
  };
  await withApi(
    pool,
    async (call) => {
      const first = await call('/api/coding/leetcode/import', { method: 'POST' });
      assert.deepEqual(first.data, { added: 2, skipped: 0, total: 2 });
      const second = await call('/api/coding/leetcode/import', { method: 'POST' });
      assert.deepEqual(second.data, { added: 0, skipped: 2, total: 2 });
      const { rows } = await pool.query(
        `SELECT p.problem_key, p.difficulty, p.url, a.result, a.attempt_date
         FROM coding_problems p JOIN coding_attempts a ON a.problem_id = p.id
         WHERE p.site = 'leetcode' AND p.problem_key = ANY($1) ORDER BY p.problem_key`,
        [slugs],
      );
      assert.equal(rows.length, 2, 'one attempt each, also after the second run');
      assert.deepEqual(rows[0], {
        problem_key: slugs[0],
        difficulty: 'Hard',
        url: `https://leetcode.com/problems/${slugs[0]}/`,
        result: 'solved',
        attempt_date: '2023-11-15',
      });
    },
    { leetCodeClient: client, leetCodeUsername: 'some_user' },
  );
});

test(
  'the summary counts today and the week, the streak and the last language',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const key = 'zz-summary-test';
    const cleanup = () => pool.query(`DELETE FROM coding_problems WHERE problem_key = $1`, [key]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });
    // Far from the real data: the summary is read for a made-up "today" in 2098.
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO coding_problems (site, problem_key, title) VALUES ('other', $1, 'Summary') RETURNING id`,
      [key],
    );
    const attempt = (date: string, result: string, minutes: number | null, language: string) =>
      pool.query(
        `INSERT INTO coding_attempts (problem_id, attempt_date, result, language, minutes, notes)
         VALUES ($1, $2, $3, $4, $5, '')`,
        [rows[0]!.id, date, result, language, minutes],
      );
    // 2098-06-03 is a Wednesday: the week starts on Sunday 2098-05-31.
    await attempt('2098-06-03', 'solved', 20, 'Python');
    await attempt('2098-06-03', 'failed', 10, 'C++');
    await attempt('2098-06-02', 'solved', null, '');
    await attempt('2098-05-30', 'solved', 5, 'Go');
    const summary = await codingSummary(pool, '2098-06-03');
    assert.deepEqual(summary.today, { attempts: 2, solved: 1, minutes: 30 });
    assert.deepEqual(summary.week, { attempts: 3, solved: 2, minutes: 30 });
    assert.equal(summary.streak, 2);
    assert.equal(summary.lastLanguage, 'C++');
  },
);
