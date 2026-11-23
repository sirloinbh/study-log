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
