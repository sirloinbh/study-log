import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Exercise = {
  id: number;
  textbookId: number;
  contentId: number;
  number: string;
  body: string;
  important: boolean;
};

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'exercises belong to a chapter, list by chapter and go with it when it is deleted',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    // A unique title prefix keeps these rows apart from anything else in the test DB.
    const prefix = '[통합테스트 연습문제]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const newBook = async (title: string) =>
        (
          (await call('/api/textbooks', { method: 'POST', body: { title: `${prefix} ${title}` } }))
            .data.textbook as { id: number }
        ).id;
      const addContent = async (bookId: number, title: string, parentId?: number) =>
        (
          (
            await call(`/api/textbooks/${bookId}/contents`, {
              method: 'POST',
              body: { title, parentId },
            })
          ).data.content as { id: number }
        ).id;
      const linear = await newBook('선형대수');
      const calculus = await newBook('미적분');
      const chapter = await addContent(linear, '행렬');
      const section = await addContent(linear, '역행렬', chapter);
      const otherChapter = await addContent(calculus, '극한');
      const path = (bookId: number, contentId: number) =>
        `/api/textbooks/${bookId}/contents/${contentId}/exercises`;

      assert.deepEqual((await call(path(linear, section))).data.exercises, []);

      const body = '다음 행렬의 역행렬을 구하시오.\n\n  A = [[1, 2], [3, 4]]';
      const first = await call(path(linear, section), {
        method: 'POST',
        body: { number: '3.1', body },
      });
      assert.equal(first.status, 201);
      const exercise = first.data.exercise as Exercise;
      assert.deepEqual(
        { ...exercise, id: 0 },
        { id: 0, textbookId: linear, contentId: section, number: '3.1', body, important: false },
        'the body is stored exactly as typed',
      );
      await call(path(linear, section), {
        method: 'POST',
        body: { number: '3.2', body: '행렬식을 구하시오', important: true },
      });
      await call(path(linear, chapter), { method: 'POST', body: { body: '장 전체 복습 문제' } });

      // Listing is per chapter, in the order the exercises were added.
      const ofSection = (await call(path(linear, section))).data.exercises as Exercise[];
      assert.deepEqual(
        ofSection.map((item) => [item.number, item.important]),
        [
          ['3.1', false],
          ['3.2', true],
        ],
      );
      assert.equal(((await call(path(linear, chapter))).data.exercises as Exercise[]).length, 1);

      // A chapter of another textbook is not reachable through this textbook.
      for (const init of [{}, { method: 'POST', body: { body: '문제' } }]) {
        const { status, data } = await call(path(linear, otherChapter), init);
        assert.equal(status, 404, init.method ?? 'GET');
        assert.equal(data.error, '목차를 찾을 수 없습니다');
      }

      const updated = await call(`/api/exercises/${exercise.id}`, {
        method: 'PUT',
        body: { number: '3.1', body: '수정한 문제', important: true },
      });
      assert.equal(updated.status, 200);
      const fetched = (await call(`/api/exercises/${exercise.id}`)).data.exercise as Exercise;
      assert.deepEqual(
        [fetched.body, fetched.important, fetched.contentId],
        ['수정한 문제', true, section],
      );

      assert.equal((await call(`/api/exercises/${exercise.id}`, { method: 'DELETE' })).status, 204);
      assert.equal((await call(`/api/exercises/${exercise.id}`)).status, 404);

      // Deleting a chapter removes its exercises and those of its sections.
      assert.equal(
        (await call(`/api/textbooks/${linear}/contents/${chapter}`, { method: 'DELETE' })).status,
        204,
      );
      const left = await pool.query(
        'SELECT count(*)::int AS n FROM exercises WHERE textbook_id = $1',
        [linear],
      );
      assert.equal(left.rows[0].n, 0);

      // The database refuses a chapter of another textbook, a blank body and a long number.
      const inCalculus = await call(path(calculus, otherChapter), {
        method: 'POST',
        body: { body: '극한값을 구하시오' },
      });
      assert.equal(inCalculus.status, 201);
      for (const [sql, params, code] of [
        [
          `INSERT INTO exercises (textbook_id, content_id, body) VALUES ($1, $2, 'x')`,
          [linear, otherChapter],
          '23503',
        ],
        [
          `INSERT INTO exercises (textbook_id, content_id, body) VALUES ($1, $2, '  ')`,
          [calculus, otherChapter],
          '23514',
        ],
        [
          // Line breaks and tabs only: as blank to the database as to the API.
          `INSERT INTO exercises (textbook_id, content_id, body) VALUES ($1, $2, $3)`,
          [calculus, otherChapter, '\n\t \n'],
          '23514',
        ],
        [
          `INSERT INTO exercises (textbook_id, content_id, number, body) VALUES ($1, $2, repeat('1', 21), 'x')`,
          [calculus, otherChapter],
          '23514',
        ],
      ] as const) {
        await assert.rejects(pool.query(sql, [...params]), { code }, sql.slice(0, 60));
      }

      // Deleting the textbook removes its exercises too.
      assert.equal((await call(`/api/textbooks/${calculus}`, { method: 'DELETE' })).status, 204);
      const gone = await pool.query(
        'SELECT count(*)::int AS n FROM exercises WHERE textbook_id = $1',
        [calculus],
      );
      assert.equal(gone.rows[0].n, 0);
    });
  },
);

test(
  'an exercise has at most one answer, replaced on save and gone with the exercise',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const prefix = '[통합테스트 정답]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const book = (
        (await call('/api/textbooks', { method: 'POST', body: { title: `${prefix} 선형대수` } }))
          .data.textbook as { id: number }
      ).id;
      const chapter = (
        (await call(`/api/textbooks/${book}/contents`, { method: 'POST', body: { title: '행렬' } }))
          .data.content as { id: number }
      ).id;
      const addExercise = async (body: string) =>
        (
          (
            await call(`/api/textbooks/${book}/contents/${chapter}/exercises`, {
              method: 'POST',
              body: { body },
            })
          ).data.exercise as Exercise
        ).id;
      const first = await addExercise('역행렬을 구하시오');
      const second = await addExercise('행렬식을 구하시오');
      const answer = (id: number) => `/api/exercises/${id}/answer`;

      assert.deepEqual((await call(answer(first))).data, { answer: null });

      const body = 'A⁻¹ = [[-2, 1],\n        [1.5, -0.5]]';
      const saved = await call(answer(first), { method: 'PUT', body: { body } });
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.data, { answer: { exerciseId: first, body } });
      assert.deepEqual((await call(answer(first))).data, { answer: { exerciseId: first, body } });

      // Saving again replaces the answer instead of adding a second one.
      await call(answer(first), { method: 'PUT', body: { body: '고친 정답' } });
      const rows = await pool.query('SELECT body FROM exercise_answers WHERE exercise_id = $1', [
        first,
      ]);
      assert.deepEqual(rows.rows, [{ body: '고친 정답' }]);
      // The other exercise is untouched.
      assert.deepEqual((await call(answer(second))).data, { answer: null });

      assert.equal((await call(answer(first), { method: 'DELETE' })).status, 204);
      assert.deepEqual((await call(answer(first))).data, { answer: null });
      const again = await call(answer(first), { method: 'DELETE' });
      assert.equal(again.status, 404);
      assert.equal(again.data.error, '정답을 찾을 수 없습니다');

      // A missing exercise has no answer to read or save.
      const missing = 999999999;
      assert.equal((await call(answer(missing))).status, 404);
      const orphan = await call(answer(missing), { method: 'PUT', body: { body: '답' } });
      assert.equal(orphan.status, 404);
      assert.equal(orphan.data.error, '연습문제를 찾을 수 없습니다');

      // The database refuses a blank answer and a second answer for the same exercise.
      await call(answer(second), { method: 'PUT', body: { body: '정답' } });
      for (const [sql, params, code] of [
        [
          `INSERT INTO exercise_answers (exercise_id, body) VALUES ($1, $2)`,
          [first, '\n\t '],
          '23514',
        ],
        [`INSERT INTO exercise_answers (exercise_id, body) VALUES ($1, 'x')`, [second], '23505'],
      ] as const) {
        await assert.rejects(pool.query(sql, [...params]), { code }, sql.slice(0, 60));
      }

      // Deleting the exercise deletes its answer.
      assert.equal((await call(`/api/exercises/${second}`, { method: 'DELETE' })).status, 204);
      const left = await pool.query(
        'SELECT count(*)::int AS n FROM exercise_answers WHERE exercise_id = $1',
        [second],
      );
      assert.equal(left.rows[0].n, 0);
    });
  },
);

test(
  'important exercises are marked, and listed by textbook or chapter in contents order',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const prefix = '[통합테스트 중요 문제]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    await withApi(pool, async (call) => {
      const newBook = async (title: string) =>
        (
          (await call('/api/textbooks', { method: 'POST', body: { title: `${prefix} ${title}` } }))
            .data.textbook as { id: number }
        ).id;
      const book = await newBook('선형대수');
      const other = await newBook('미적분');
      const addContent = async (bookId: number, title: string, parentId?: number) =>
        (
          (
            await call(`/api/textbooks/${bookId}/contents`, {
              method: 'POST',
              body: { title, parentId },
            })
          ).data.content as { id: number }
        ).id;
      const vectors = await addContent(book, '벡터');
      const matrices = await addContent(book, '행렬');
      const dot = await addContent(book, '내적', vectors);
      const limits = await addContent(other, '극한');
      const add = async (bookId: number, contentId: number, number: string, important = false) =>
        (
          (
            await call(`/api/textbooks/${bookId}/contents/${contentId}/exercises`, {
              method: 'POST',
              body: { number, body: `${number}번 문제`, important },
            })
          ).data.exercise as Exercise
        ).id;
      // Added out of contents order on purpose.
      const m1 = await add(book, matrices, 'm1');
      const d1 = await add(book, dot, 'd1', true);
      const v1 = await add(book, vectors, 'v1');
      await add(book, vectors, 'v2');
      await add(other, limits, 'l1', true);

      const mark = (id: number, important: boolean) =>
        call(`/api/exercises/${id}/important`, { method: 'PATCH', body: { important } });
      const marked = await mark(m1, true);
      assert.equal(marked.status, 200);
      assert.equal((marked.data.exercise as Exercise).important, true);
      assert.equal((await mark(v1, true)).status, 200);
      // Marking leaves the rest as it was.
      assert.equal(
        ((await call(`/api/exercises/${m1}`)).data.exercise as Exercise).body,
        'm1번 문제',
      );

      const numbers = async (query: string) =>
        ((await call(`/api/textbooks/${book}/exercises${query}`)).data.exercises as Exercise[]).map(
          (e) => e.number,
        );
      // Chapter 벡터, its section 내적, then chapter 행렬; nothing from the other textbook.
      assert.deepEqual(await numbers('?important=true'), ['v1', 'd1', 'm1']);
      assert.deepEqual(await numbers(''), ['v1', 'v2', 'd1', 'm1']);
      assert.deepEqual(await numbers(`?important=true&contentId=${vectors}`), ['v1', 'd1']);
      assert.deepEqual(await numbers(`?important=true&contentId=${dot}`), ['d1']);
      assert.deepEqual(await numbers('?important=false'), ['v2']);

      assert.equal((await mark(d1, false)).status, 200);
      assert.deepEqual(await numbers('?important=true'), ['v1', 'm1']);

      // Moving a chapter changes the list order with it.
      const moved = await call(`/api/textbooks/${book}/contents/order`, {
        method: 'PUT',
        body: { ids: [matrices, vectors] },
      });
      assert.equal(moved.status, 200);
      assert.deepEqual(await numbers('?important=true'), ['m1', 'v1']);

      const otherChapter = await call(`/api/textbooks/${book}/exercises?contentId=${limits}`);
      assert.equal(otherChapter.status, 404);
      assert.equal(otherChapter.data.error, '목차를 찾을 수 없습니다');
      const missing = await call('/api/textbooks/999999999/exercises');
      assert.equal(missing.status, 404);
      assert.equal(missing.data.error, '교재를 찾을 수 없습니다');
      assert.equal((await mark(999999999, true)).status, 404);
    });
  },
);
