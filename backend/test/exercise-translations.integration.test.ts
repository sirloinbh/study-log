import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { TranslationError, type TranslationSource } from '../src/translation.js';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Translation = {
  body: string;
  answer: string | null;
  model: string;
  updatedAt: string;
  stale: boolean;
};

// #31. Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without
// it. A stand-in translator marks what it was given, so no request reaches Claude.
test(
  'a translation is kept per exercise and goes out of date when the exercise or answer changes',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    // A unique title prefix keeps these rows apart from anything else in the test DB.
    const prefix = '[통합테스트 번역]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    const given: TranslationSource[] = [];
    let fail = false;
    const translator = async (source: TranslationSource) => {
      if (fail) throw new TranslationError(422, '이 내용은 번역할 수 없습니다');
      given.push(source);
      return {
        body: `번역: ${source.body}`,
        answer: source.answer === null ? null : `번역: ${source.answer}`,
        model: 'claude-sonnet-5-5',
      };
    };

    await withApi(
      pool,
      async (call) => {
        const book = (
          (await call('/api/textbooks', { method: 'POST', body: { title: `${prefix} 선형대수` } }))
            .data.textbook as { id: number }
        ).id;
        const content = (
          (
            await call(`/api/textbooks/${book}/contents`, {
              method: 'POST',
              body: { title: 'Matrices' },
            })
          ).data.content as { id: number }
        ).id;
        const exercise = (
          (
            await call(`/api/textbooks/${book}/contents/${content}/exercises`, {
              method: 'POST',
              body: { number: '1', body: 'Find the inverse of $A$.\n  (a) 2x2' },
            })
          ).data.exercise as { id: number }
        ).id;
        const path = `/api/exercises/${exercise}/translation`;
        const read = async () => (await call(path)).data.translation as Translation | null;

        assert.equal(await read(), null, 'nothing translated yet');

        // Without an answer, only the problem is translated; line breaks are kept.
        const first = await call(path, { method: 'POST', body: {} });
        assert.equal(first.status, 200);
        const made = first.data.translation as Translation;
        assert.deepEqual(
          [made.body, made.answer, made.model, made.stale],
          ['번역: Find the inverse of $A$.\n  (a) 2x2', null, 'claude-sonnet-5-5', false],
        );
        assert.match(made.updatedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
        assert.deepEqual(given, [{ body: 'Find the inverse of $A$.\n  (a) 2x2', answer: null }]);

        // A new answer makes it out of date; translating again includes the answer.
        await call(`/api/exercises/${exercise}/answer`, {
          method: 'PUT',
          body: { body: '$A^{-1}$' },
        });
        assert.equal((await read())?.stale, true);
        const again = (await call(path, { method: 'POST', body: {} })).data
          .translation as Translation;
        assert.deepEqual([again.answer, again.stale], ['번역: $A^{-1}$', false]);
        const rows = await pool.query(
          'SELECT count(*)::int AS n FROM exercise_translations WHERE exercise_id = $1',
          [exercise],
        );
        assert.equal(rows.rows[0].n, 1, 'one translation per exercise');

        // Editing the problem or deleting the answer makes it out of date too.
        await call(`/api/exercises/${exercise}`, {
          method: 'PUT',
          body: { number: '1', body: 'Find the inverse of $B$.' },
        });
        assert.equal((await read())?.stale, true);
        await call(path, { method: 'POST', body: {} });
        await call(`/api/exercises/${exercise}/answer`, { method: 'DELETE' });
        assert.equal((await read())?.stale, true);

        // A failed translation keeps the one already there.
        fail = true;
        const refused = await call(path, { method: 'POST', body: {} });
        assert.equal(refused.status, 422);
        assert.equal((await read())?.body, '번역: Find the inverse of $B$.');

        // The translation goes with its exercise.
        await call(`/api/exercises/${exercise}`, { method: 'DELETE' });
        const gone = await pool.query(
          'SELECT count(*)::int AS n FROM exercise_translations WHERE exercise_id = $1',
          [exercise],
        );
        assert.equal(gone.rows[0].n, 0);
        assert.equal((await call(path)).status, 404);
      },
      { translator },
    );
  },
);
