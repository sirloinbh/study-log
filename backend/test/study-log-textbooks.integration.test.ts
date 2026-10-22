import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Log = {
  id: number;
  textbookId: number | null;
  textbookTitle: string | null;
  contentId: number | null;
  contentNumber: string | null;
  contentTitle: string | null;
};

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'study logs link to a textbook and chapter, filter by textbook and protect what they link to',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    // A far-future date and a title prefix keep these rows apart from anything else.
    const day = '2099-02-20';
    const prefix = '[통합테스트 연결]';
    const cleanup = async () => {
      await pool.query('DELETE FROM study_logs WHERE study_date = $1', [day]);
      await pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    };
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
      const addContent = async (bookId: number, title: string, number: string, parentId?: number) =>
        (
          (
            await call(`/api/textbooks/${bookId}/contents`, {
              method: 'POST',
              body: { title, number, parentId },
            })
          ).data.content as { id: number }
        ).id;
      const linear = await newBook('선형대수');
      const calculus = await newBook('미적분');
      const chapter = await addContent(linear, '벡터', '1');
      const section = await addContent(linear, '내적', '1.2', chapter);
      const otherChapter = await addContent(calculus, '극한', '1');
      const session = { studyDate: day, startTime: '09:00', endTime: '10:00' };

      const linked = await call('/api/study-logs', {
        method: 'POST',
        body: { ...session, textbookId: linear, contentId: section },
      });
      assert.equal(linked.status, 201);
      const log = linked.data.studyLog as Log;
      assert.deepEqual(
        [log.textbookId, log.textbookTitle, log.contentId, log.contentNumber, log.contentTitle],
        [linear, `${prefix} 선형대수`, section, '1.2', '내적'],
      );
      const bookOnly = await call('/api/study-logs', {
        method: 'POST',
        body: { ...session, startTime: '11:00', endTime: '12:00', textbookId: calculus },
      });
      assert.equal((bookOnly.data.studyLog as Log).contentId, null);
      await call('/api/study-logs', {
        method: 'POST',
        body: { ...session, startTime: '13:00', endTime: '14:00' },
      });

      // Missing textbooks and chapters of another textbook are refused in Korean.
      for (const [body, message] of [
        [{ ...session, textbookId: 999_999_999 }, '교재를 찾을 수 없습니다'],
        [{ ...session, textbookId: linear, contentId: otherChapter }, '목차를 찾을 수 없습니다'],
      ] as const) {
        const refused = await call('/api/study-logs', { method: 'POST', body });
        assert.equal(refused.status, 400);
        assert.equal(refused.data.error, message);
      }

      // Filter by textbook, alone and with a date.
      const ofLinear = (await call(`/api/study-logs?textbookId=${linear}`)).data.studyLogs as Log[];
      assert.deepEqual(
        ofLinear.map((item) => item.id),
        [log.id],
      );
      const dayOfCalculus = (await call(`/api/study-logs?date=${day}&textbookId=${calculus}`)).data
        .studyLogs as Log[];
      assert.deepEqual(
        dayOfCalculus.map((item) => item.textbookId),
        [calculus],
      );
      const wholeDay = (await call(`/api/study-logs?date=${day}`)).data.studyLogs as Log[];
      assert.equal(wholeDay.length, 3);

      // What a log points to cannot be deleted: the textbook, the section or its chapter.
      const blockedBook = await call(`/api/textbooks/${linear}`, { method: 'DELETE' });
      assert.equal(blockedBook.status, 409);
      assert.equal(blockedBook.data.error, '학습 기록이 연결된 교재는 삭제할 수 없습니다');
      for (const id of [section, chapter]) {
        const blocked = await call(`/api/textbooks/${linear}/contents/${id}`, { method: 'DELETE' });
        assert.equal(blocked.status, 409, `content ${id}`);
        assert.equal(blocked.data.error, '학습 기록이 연결된 목차는 삭제할 수 없습니다');
      }
      const stillThere = (await call(`/api/textbooks/${linear}/contents`)).data.contents as {
        children: unknown[];
      }[];
      assert.equal(stillThere[0].children.length, 1, 'a blocked delete changes nothing');

      // Once the log points elsewhere, the chapter and then the textbook can go.
      const moved = await call(`/api/study-logs/${log.id}`, {
        method: 'PUT',
        body: { ...session, textbookId: linear },
      });
      assert.equal((moved.data.studyLog as Log).contentId, null);
      assert.equal(
        (await call(`/api/textbooks/${linear}/contents/${chapter}`, { method: 'DELETE' })).status,
        204,
      );
      await call(`/api/study-logs/${log.id}`, { method: 'PUT', body: session });
      assert.equal((await call(`/api/textbooks/${linear}`, { method: 'DELETE' })).status, 204);

      // The database also refuses a chapter without its textbook.
      await assert.rejects(
        pool.query(
          `INSERT INTO study_logs (study_date, start_time, end_time, duration_minutes, content_id)
           VALUES ($1, '09:00', '10:00', 60, $2)`,
          [day, otherChapter],
        ),
        { code: '23514' },
      );
    });
  },
);
