import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'attempts are listed newest first, deleted one by one, and go with their exercise (#356)',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const prefix = '[통합테스트 시도]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const book = (
        (await call('/api/textbooks', { method: 'POST', body: { title: `${prefix} 책` } })).data
          .textbook as { id: number }
      ).id;
      const chapter = (
        (await call(`/api/textbooks/${book}/contents`, { method: 'POST', body: { title: '1장' } }))
          .data.content as { id: number }
      ).id;
      const exercise = (
        (
          await call(`/api/textbooks/${book}/contents/${chapter}/exercises`, {
            method: 'POST',
            body: { body: '문제' },
          })
        ).data.exercise as { id: number }
      ).id;
      const path = `/api/exercises/${exercise}/attempts`;

      assert.deepEqual((await call(path)).data.attempts, []);
      const first = await call(path, {
        method: 'POST',
        body: { result: 'wrong', date: '2026-11-01', hintUsed: true, note: '막힘' },
      });
      assert.equal(first.status, 201);
      await call(path, { method: 'POST', body: { result: 'correct', date: '2026-11-05' } });
      const list = (await call(path)).data.attempts as {
        id: number;
        date: string;
        result: string;
      }[];
      assert.deepEqual(
        list.map((a) => [a.date, a.result]),
        [
          ['2026-11-05', 'correct'],
          ['2026-11-01', 'wrong'],
        ],
      );
      assert.equal((await call('/api/exercises/999999999/attempts')).status, 404);
      assert.equal(
        (
          await call('/api/exercises/999999999/attempts', {
            method: 'POST',
            body: { result: 'wrong' },
          })
        ).status,
        404,
      );

      assert.equal(
        (await call(`/api/exercise-attempts/${list[0].id}`, { method: 'DELETE' })).status,
        204,
      );
      assert.equal(
        (await call(`/api/exercise-attempts/${list[0].id}`, { method: 'DELETE' })).status,
        404,
      );
      assert.equal(((await call(path)).data.attempts as unknown[]).length, 1);

      assert.equal((await call(`/api/exercises/${exercise}`, { method: 'DELETE' })).status, 204);
      const left = await pool.query('SELECT 1 FROM exercise_attempts WHERE exercise_id = $1', [
        exercise,
      ]);
      assert.equal(left.rowCount, 0);
    });
  },
);
