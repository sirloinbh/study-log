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

test(
  'an exercise is listed as wrong while its latest attempt is wrong or hinted (#357)',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const prefix = '[통합테스트 오답]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const post = async (path: string, body: unknown, field: string) =>
        ((await call(path, { method: 'POST', body })).data[field] as { id: number }).id;
      const book = await post('/api/textbooks', { title: `${prefix} 책` }, 'textbook');
      const other = await post('/api/textbooks', { title: `${prefix} 다른 책` }, 'textbook');
      const chapter = await post(`/api/textbooks/${book}/contents`, { title: '1장' }, 'content');
      const chapter2 = await post(`/api/textbooks/${other}/contents`, { title: 'A장' }, 'content');
      const exercise = (b: number, c: number, body: string) =>
        post(`/api/textbooks/${b}/contents/${c}/exercises`, { body }, 'exercise');
      const wrongOne = await exercise(book, chapter, '틀린 문제');
      const fixed = await exercise(book, chapter, '고친 문제');
      const hinted = await exercise(book, chapter, '힌트 문제');
      const clean = await exercise(book, chapter, '맞힌 문제');
      const elsewhere = await exercise(other, chapter2, '다른 책 문제');
      await exercise(book, chapter, '시도 없음');
      const attempt = (id: number, body: object) =>
        call(`/api/exercises/${id}/attempts`, { method: 'POST', body });
      await attempt(wrongOne, { result: 'wrong', date: '2026-11-03' });
      await attempt(fixed, { result: 'wrong', date: '2026-11-01' });
      await attempt(fixed, { result: 'correct', date: '2026-11-02' });
      await attempt(hinted, { result: 'correct', hintUsed: true, date: '2026-11-04' });
      await attempt(clean, { result: 'correct', date: '2026-11-05' });
      await attempt(elsewhere, { result: 'wrong', date: '2026-11-06' });

      const ids = async (query = '') =>
        (
          (await call(`/api/exercises/wrong?${query}`)).data.exercises as {
            id: number;
          }[]
        ).map((e) => e.id);
      // Newest attempt first; an exercise whose latest attempt is clean and correct is not listed.
      assert.deepEqual(await ids(), [elsewhere, hinted, wrongOne]);
      assert.deepEqual(await ids(`textbookId=${book}`), [hinted, wrongOne]);
      assert.deepEqual(await ids(`contentId=${chapter2}`), [elsewhere]);
      const first = (await call('/api/exercises/wrong')).data.exercises as Record<
        string,
        unknown
      >[];
      assert.deepEqual(
        [
          first[0].textbookTitle,
          first[0].contentTitle,
          first[0].lastAttemptDate,
          first[0].lastResult,
        ],
        [`${prefix} 다른 책`, 'A장', '2026-11-06', 'wrong'],
      );

      // A clean correct attempt takes it off the list; a later wrong one puts it back.
      await attempt(wrongOne, { result: 'correct', date: '2026-11-07' });
      assert.deepEqual(await ids(`textbookId=${book}`), [hinted]);
      await attempt(fixed, { result: 'wrong', date: '2026-11-08' });
      assert.deepEqual(await ids(`textbookId=${book}`), [fixed, hinted]);
    });
  },
);

test(
  'attempts drive the review cycle: 1, 3, 7, 14 days, restart on a wrong try (#358)',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const prefix = '[통합테스트 문제복습]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(
      pool,
      async (call) => {
        const post = async (path: string, body: unknown, field: string) =>
          ((await call(path, { method: 'POST', body })).data[field] as { id: number }).id;
        const book = await post('/api/textbooks', { title: `${prefix} 책` }, 'textbook');
        const chapter = await post(`/api/textbooks/${book}/contents`, { title: '1장' }, 'content');
        const exercise = await post(
          `/api/textbooks/${book}/contents/${chapter}/exercises`,
          { number: '3', body: '복습할 문제' },
          'exercise',
        );
        const attempt = (body: object) =>
          call(`/api/exercises/${exercise}/attempts`, { method: 'POST', body });
        const mine = async (range = 'all') =>
          (
            (await call(`/api/reviews/${range}`)).data.exerciseReviews as {
              exerciseId: number;
              step: number;
              dueDate: string;
            }[]
          ).filter((r) => r.exerciseId === exercise);
        const count = async () => (await call('/api/reviews/today/count')).data.count as number;

        // A clean correct attempt on a never-wrong exercise schedules nothing.
        await attempt({ result: 'correct', date: '2026-11-01' });
        assert.deepEqual(await mine(), []);

        await attempt({ result: 'wrong', date: '2026-11-10' });
        assert.deepEqual(
          (await mine()).map((r) => [r.step, r.dueDate]),
          [[1, '2026-11-11']],
        );
        // Due today (2026-11-23 in the test clock) or earlier shows in today's list and the badge.
        assert.equal((await mine('today')).length, 1);
        const before = await count();
        assert.ok(before >= 1);

        await attempt({ result: 'correct', date: '2026-11-11' });
        await attempt({ result: 'correct', date: '2026-11-14' });
        assert.deepEqual(
          (await mine()).map((r) => [r.step, r.dueDate]),
          [[3, '2026-11-21']],
        );
        // A hinted retry restarts the cycle.
        await attempt({ result: 'correct', hintUsed: true, date: '2026-11-22' });
        assert.deepEqual(
          (await mine()).map((r) => [r.step, r.dueDate]),
          [[1, '2026-11-23']],
        );
        // Four clean attempts finish it.
        for (const date of ['2026-11-23', '2026-11-24', '2026-11-27', '2026-12-04']) {
          await attempt({ result: 'correct', date });
        }
        assert.deepEqual(await mine(), []);
        assert.equal(await count(), before - 1);

        // Deleting the only wrong attempt clears its review (#393); an earlier date added later
        // is placed in date order.
        const wrong = await attempt({ result: 'wrong', date: '2026-11-23' });
        assert.equal((await mine()).length, 1);
        const wrongId = (wrong.data.attempt as { id: number }).id;
        await call(`/api/exercise-attempts/${wrongId}`, { method: 'DELETE' });
        assert.deepEqual(await mine(), []);
        await attempt({ result: 'wrong', date: '2026-11-23' });
        await attempt({ result: 'wrong', date: '2026-11-01' });
        assert.deepEqual(
          (await mine()).map((r) => [r.step, r.dueDate]),
          [[1, '2026-11-24']],
        );

        // Deleting the exercise removes a running cycle.
        await call(`/api/exercises/${exercise}`, { method: 'DELETE' });
        const left = await pool.query('SELECT 1 FROM exercise_reviews WHERE exercise_id = $1', [
          exercise,
        ]);
        assert.equal(left.rowCount, 0);
      },
      { today: () => '2026-11-23' },
    );
  },
);

test(
  'feedback is stored per attempt, listed with it after a reload, and goes with it (#363)',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const prefix = '[통합테스트 피드백]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(
      pool,
      async (call) => {
        const post = async (path: string, body: unknown, field: string) =>
          ((await call(path, { method: 'POST', body })).data[field] as { id: number }).id;
        const book = await post('/api/textbooks', { title: `${prefix} 책` }, 'textbook');
        const chapter = await post(`/api/textbooks/${book}/contents`, { title: '1장' }, 'content');
        const exercise = await post(
          `/api/textbooks/${book}/contents/${chapter}/exercises`,
          { body: '증명하시오' },
          'exercise',
        );
        await call(`/api/exercises/${exercise}/answer`, {
          method: 'PUT',
          body: { body: '귀납법' },
        });
        const first = await post(
          `/api/exercises/${exercise}/attempts`,
          { result: 'wrong', date: '2026-11-01' },
          'attempt',
        );
        const second = await post(
          `/api/exercises/${exercise}/attempts`,
          { result: 'correct', date: '2026-11-02' },
          'attempt',
        );

        const asked = await call(`/api/exercise-attempts/${first}/feedback`, {
          method: 'POST',
          body: { mode: 'grade', solution: '내 풀이' },
        });
        assert.equal(asked.status, 201);
        await call(`/api/exercise-attempts/${first}/feedback`, {
          method: 'POST',
          body: { mode: 'hint', solution: '다시 푼 풀이' },
        });

        // After a reload the attempt lists its feedback, oldest first; the other attempt has none.
        const list = (await call(`/api/exercises/${exercise}/attempts`)).data.attempts as {
          id: number;
          feedback: { mode: string; solution: string; feedback: string; hasImage: boolean }[];
        }[];
        const byId = new Map(list.map((a) => [a.id, a.feedback]));
        assert.deepEqual(byId.get(second), []);
        assert.deepEqual(
          byId.get(first)?.map((f) => [f.mode, f.solution, f.feedback, f.hasImage]),
          [
            ['grade', '내 풀이', 'Feedback: grade', false],
            ['hint', '다시 푼 풀이', 'Feedback: hint', false],
          ],
        );
        assert.equal(
          (
            await call('/api/exercise-attempts/999999999/feedback', {
              method: 'POST',
              body: { mode: 'hint', solution: 'x' },
            })
          ).status,
          404,
        );

        // Deleting the attempt, then the exercise, removes the feedback rows.
        await call(`/api/exercise-attempts/${first}`, { method: 'DELETE' });
        const left = await pool.query(
          'SELECT 1 FROM exercise_attempt_feedback WHERE attempt_id = $1',
          [first],
        );
        assert.equal(left.rowCount, 0);
      },
      {
        feedbacker: async (source) => ({
          feedback: `Feedback: ${source.mode}`,
          model: 'claude-sonnet-5-5',
        }),
      },
    );
  },
);
