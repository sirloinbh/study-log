import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Listed = { id: number; round: number; dueDate: string; memo: string };

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test('today lists due reviews until they are completed', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  // A year no other test uses keeps these rows apart while test files run in parallel.
  const year = '8043';
  const cleanup = () =>
    pool.query(`DELETE FROM study_logs WHERE to_char(study_date, 'YYYY') = $1`, [year]);
  await cleanup();
  t.after(async () => {
    await cleanup();
    await pool.end();
  });

  let today = `${year}-03-02`;
  await withApi(
    pool,
    async (call) => {
      const create = async (studyDate: string, memo: string) => {
        const created = await call('/api/study-logs', {
          method: 'POST',
          body: { studyDate, startTime: '09:00', endTime: '10:00', memo, status: 'done' },
        });
        assert.equal(created.status, 201);
        return (created.data.studyLog as { id: number }).id;
      };
      // Other test files may have due reviews in the test DB, so only this year's rows count.
      const listed = async () => {
        const { status, data } = await call('/api/reviews/today');
        assert.equal(status, 200);
        assert.equal(data.today, today);
        return (data.reviews as Listed[]).filter((r) => r.dueDate.startsWith(year));
      };
      const complete = (id: number) => call(`/api/reviews/${id}/complete`, { method: 'POST' });

      await create(`${year}-03-01`, '오늘 복습');
      await create(`${year}-02-20`, '지난 복습');
      await create(`${year}-03-02`, '내일 복습');

      await t.test('due and overdue rounds come oldest first, future ones not', async () => {
        const reviews = await listed();
        assert.deepEqual(
          reviews.map((r) => [r.memo, r.round, r.dueDate]),
          [
            ['지난 복습', 1, `${year}-02-21`],
            ['오늘 복습', 1, `${year}-03-02`],
          ],
        );
      });

      await t.test('an uncompleted round stays on later days', async () => {
        today = `${year}-03-20`;
        assert.equal((await listed()).length, 3);
        today = `${year}-03-02`;
      });

      await t.test('rounds run on from each completion date to the end', async () => {
        const logId = await create(`${year}-06-01`, '끝까지');
        const expected = [
          [1, `${year}-06-02`],
          [2, `${year}-06-04`],
          [3, `${year}-06-08`],
          [4, `${year}-06-15`],
          [5, `${year}-07-01`],
        ] as const;
        for (const [index, [round, due]] of expected.entries()) {
          today = due;
          const review = (await listed()).find((r) => r.memo === '끝까지');
          assert.deepEqual([review?.round, review?.dueDate], [round, due]);
          const { status, data } = await complete(review!.id);
          assert.equal(status, 200);
          assert.equal(data.completedOn, due);
          assert.deepEqual(
            data.next,
            index < 4 ? { round: round + 1, dueDate: expected[index + 1][1] } : null,
          );
          assert.equal((await listed()).filter((r) => r.memo === '끝까지').length, 0);
        }
        const { rows } = await pool.query(
          'SELECT count(*)::int AS rounds, count(completed_on)::int AS done FROM reviews WHERE study_log_id = $1',
          [logId],
        );
        assert.deepEqual(rows[0], { rounds: 5, done: 5 });
      });

      await t.test('a late completion moves only the rounds after it', async () => {
        await create(`${year}-08-01`, '늦은 복습');
        today = `${year}-08-10`;
        const review = (await listed()).find((r) => r.memo === '늦은 복습')!;
        const { data } = await complete(review.id);
        assert.deepEqual(data.next, { round: 2, dueDate: `${year}-08-12` });
        const { rows } = await pool.query(
          `SELECT due_date AS due, original_due_date AS original, completed_on AS completed
           FROM reviews WHERE id = $1`,
          [review.id],
        );
        assert.deepEqual(rows[0], {
          due: `${year}-08-02`,
          original: `${year}-08-02`,
          completed: `${year}-08-10`,
        });
      });

      await t.test('completing twice is refused and leaves one next round', async () => {
        await create(`${year}-09-01`, '두 번 완료');
        today = `${year}-09-02`;
        const review = (await listed()).find((r) => r.memo === '두 번 완료')!;
        const answers = await Promise.all([complete(review.id), complete(review.id)]);
        assert.deepEqual(answers.map((a) => a.status).sort(), [200, 409]);
        assert.equal(answers.find((a) => a.status === 409)?.data.error, '이미 완료한 복습입니다');
        const { rows } = await pool.query(
          `SELECT count(*)::int AS n FROM reviews
           WHERE round = 2 AND study_log_id = (SELECT study_log_id FROM reviews WHERE id = $1)`,
          [review.id],
        );
        assert.deepEqual(rows[0], { n: 1 });
      });

      await t.test('a review that does not exist answers a Korean 404', async () => {
        const { status, data } = await complete(999_999_999_999_998);
        assert.equal(status, 404);
        assert.equal(data.error, '복습을 찾을 수 없습니다');
      });

      await t.test('an invalid id answers a Korean 400', async () => {
        const { status, data } = await call('/api/reviews/abc/complete', { method: 'POST' });
        assert.equal(status, 400);
        assert.equal(data.error, '복습 ID가 올바르지 않습니다');
      });
    },
    { today: () => today },
  );
});
