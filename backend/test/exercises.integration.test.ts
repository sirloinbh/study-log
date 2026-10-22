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
