import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Listed = { id: number; round: number; dueDate: string; memo: string };

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test('reviews are listed by range and moved one round at a time', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  // A year no other test uses keeps these rows apart while test files run in parallel.
  const year = '8044';
  const cleanup = () =>
    pool.query(`DELETE FROM study_logs WHERE to_char(study_date, 'YYYY') = $1`, [year]);
  await cleanup();
  t.after(async () => {
    await cleanup();
    await pool.end();
  });

  // A Wednesday; that week runs from Sunday the 6th to Saturday the 12th.
  let today = `${year}-03-09`;
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
      // Other test files may have reviews in the test DB, so only this year's rows count.
      const listed = async (range: string) => {
        const { status, data } = await call(`/api/reviews/${range}`);
        assert.equal(status, 200);
        assert.equal(data.today, today);
        return (data.reviews as Listed[]).filter((r) => r.dueDate.startsWith(year));
      };
      const memos = async (range: string) => (await listed(range)).map((r) => r.memo);
      const find = async (memo: string) => (await listed('all')).find((r) => r.memo === memo)!;
      const rows = async (logId: number) =>
        (
          await pool.query(
            `SELECT round, due_date AS due, original_due_date AS original, completed_on AS completed
             FROM reviews WHERE study_log_id = $1 ORDER BY round`,
            [logId],
          )
        ).rows;
      const snooze = (id: number) => call(`/api/reviews/${id}/snooze`, { method: 'POST' });
      const move = (id: number, dueDate: unknown) =>
        call(`/api/reviews/${id}/due-date`, { method: 'PUT', body: { dueDate } });

      await t.test('each range lists rounds up to its end, oldest first', async () => {
        await create(`${year}-03-01`, '지남');
        await create(`${year}-03-08`, '오늘');
        await create(`${year}-03-11`, '토요일');
        await create(`${year}-03-12`, '다음 주');
        assert.deepEqual(await memos('today'), ['지남', '오늘']);
        assert.deepEqual(await memos('week'), ['지남', '오늘', '토요일']);
        assert.deepEqual(await memos('all'), ['지남', '오늘', '토요일', '다음 주']);
      });

      await t.test('a snooze moves only the date, from today when overdue', async () => {
        const logId = await create(`${year}-02-01`, '지난 미루기');
        const { id } = await find('지난 미루기');
        const { status, data } = await snooze(id);
        assert.equal(status, 200);
        assert.equal(data.dueDate, `${year}-03-10`);
        assert.deepEqual(await rows(logId), [
          { round: 1, due: `${year}-03-10`, original: `${year}-02-02`, completed: null },
        ]);
      });

      await t.test('a snooze of a later round moves it a day from its own date', async () => {
        const logId = await create(`${year}-05-01`, '앞날 미루기');
        const { id } = await find('앞날 미루기');
        assert.equal((await snooze(id)).data.dueDate, `${year}-05-03`);
        assert.equal((await rows(logId)).length, 1);
      });

      await t.test('a snoozed round leaves today and the badge count', async () => {
        const before = (await call('/api/reviews/today/count')).data.count as number;
        await create(`${year}-03-08`, '오늘 미루기');
        assert.equal((await call('/api/reviews/today/count')).data.count, before + 1);
        await snooze((await find('오늘 미루기')).id);
        assert.ok(!(await memos('today')).includes('오늘 미루기'));
        assert.equal((await call('/api/reviews/today/count')).data.count, before);
      });

      await t.test('the next round counts from the completion, not the snoozed date', async () => {
        const logId = await create(`${year}-03-08`, '미룬 뒤 완료');
        const { id } = await find('미룬 뒤 완료');
        await snooze(id);
        today = `${year}-03-15`;
        const { data } = await call(`/api/reviews/${id}/complete`, { method: 'POST' });
        assert.deepEqual(data.next, { round: 2, dueDate: `${year}-03-17` });
        assert.deepEqual(await rows(logId), [
          {
            round: 1,
            due: `${year}-03-10`,
            original: `${year}-03-09`,
            completed: `${year}-03-15`,
          },
          { round: 2, due: `${year}-03-17`, original: `${year}-03-17`, completed: null },
        ]);
        today = `${year}-03-09`;
      });

      await t.test('a date can be moved either way, keeping the original', async () => {
        const logId = await create(`${year}-06-01`, '날짜 변경');
        const { id } = await find('날짜 변경');
        assert.equal((await move(id, `${year}-07-20`)).data.dueDate, `${year}-07-20`);
        assert.equal((await move(id, `${year}-01-05`)).data.dueDate, `${year}-01-05`);
        assert.deepEqual(await rows(logId), [
          { round: 1, due: `${year}-01-05`, original: `${year}-06-02`, completed: null },
        ]);
      });

      await t.test('the date of a wrongly completed round’s next one can be fixed', async () => {
        const logId = await create(`${year}-03-08`, '잘못 완료');
        const first = await find('잘못 완료');
        await call(`/api/reviews/${first.id}/complete`, { method: 'POST' });
        const next = await find('잘못 완료');
        assert.equal(next.round, 2);
        assert.equal((await move(next.id, `${year}-03-20`)).status, 200);
        const stored = await rows(logId);
        assert.equal(stored[0].due, `${year}-03-09`);
        assert.equal(stored[1].due, `${year}-03-20`);
      });

      await t.test('a completed round cannot be moved', async () => {
        const logId = await create(`${year}-08-01`, '완료 후 변경');
        const { id } = await find('완료 후 변경');
        await call(`/api/reviews/${id}/complete`, { method: 'POST' });
        for (const answer of [await snooze(id), await move(id, `${year}-09-01`)]) {
          assert.equal(answer.status, 409);
          assert.equal(answer.data.error, '이미 완료한 복습입니다');
        }
        assert.equal((await rows(logId))[0].due, `${year}-08-02`);
      });

      await t.test('a review that does not exist answers a Korean 404', async () => {
        for (const answer of [
          await snooze(999_999_999_999_998),
          await move(999_999_999_999_998, `${year}-09-01`),
        ]) {
          assert.equal(answer.status, 404);
          assert.equal(answer.data.error, '복습을 찾을 수 없습니다');
        }
      });

      await t.test('a bad date or id answers a Korean 400 and changes nothing', async () => {
        const logId = await create(`${year}-10-01`, '잘못된 날짜');
        const { id } = await find('잘못된 날짜');
        for (const [dueDate, message] of [
          [undefined, '예정일을 입력하세요'],
          [20, '예정일 형식이 올바르지 않습니다'],
          ['8044/01/01', '예정일은 YYYY-MM-DD 형식으로 입력하세요, 존재하지 않는 날짜입니다'],
          ['8044-02-31', '존재하지 않는 날짜입니다'],
          ['0000-01-01', '존재하지 않는 날짜입니다'],
        ]) {
          const { status, data } = await move(id, dueDate);
          assert.equal(status, 400);
          assert.equal(data.error, message);
        }
        const noBody = await call(`/api/reviews/${id}/due-date`, { method: 'PUT' });
        assert.equal(noBody.data.error, '예정일을 JSON 객체로 보내세요');
        assert.equal((await rows(logId))[0].due, `${year}-10-02`);
        const badId = await call('/api/reviews/abc/snooze', { method: 'POST' });
        assert.equal(badId.status, 400);
        assert.equal(badId.data.error, '복습 ID가 올바르지 않습니다');
      });
    },
    { today: () => today },
  );
});
