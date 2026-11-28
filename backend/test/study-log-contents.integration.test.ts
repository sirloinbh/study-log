import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Log = { id: number; finishedContentIds: number[] };
type Finished = {
  chapters: number;
  sections: number;
  totalChapters: number;
  totalSections: number;
  cumulativeChapters: number;
  cumulativeSections: number;
  todayChapters: number;
  daily: { date: string; chapters: number; sections: number }[];
  weekly: { weekStart: string; chapters: number; sections: number }[];
};

// #480. Requires a dedicated test DB with database/migrations applied. Year 8060 and the title
// prefix belong to this test alone; the statistics are read for its own textbooks.
test(
  'a log finishes several chapters and sections, and each is counted once',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const prefix = '[통합테스트 완료]';
    const cleanup = async () => {
      await pool.query(
        "DELETE FROM study_logs WHERE study_date BETWEEN '8060-01-01' AND '8060-12-31'",
      );
      await pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    };
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    let today = '8060-03-10';
    await withApi(
      pool,
      async (call) => {
        const newBook = async (title: string) =>
          (
            (
              await call('/api/textbooks', {
                method: 'POST',
                body: { title: `${prefix} ${title}` },
              })
            ).data.textbook as { id: number }
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
        const book = await newBook('책');
        const other = await newBook('다른 책');
        const ch1 = await addContent(book, '1장');
        const s11 = await addContent(book, '1.1절', ch1);
        const s12 = await addContent(book, '1.2절', ch1);
        const ch2 = await addContent(book, '2장');
        const otherChapter = await addContent(other, '극한');
        const save = (body: Record<string, unknown>, method = 'POST', id = '') =>
          call(`/api/study-logs${id}`, {
            method,
            body: { startTime: '09:00', endTime: '10:00', status: 'done', ...body },
          });
        const stats = async (textbookId: number) => {
          const answer = await call(
            `/api/stats/finished-contents?period=month&textbookId=${textbookId}`,
          );
          assert.equal(answer.status, 200, JSON.stringify(answer.data));
          return answer.data as unknown as Finished;
        };

        await t.test('the finished entries are saved, read back and replaced', async () => {
          const first = await save({
            studyDate: '8060-03-02',
            textbookId: book,
            finishedContentIds: [s12, ch1, s11, s11],
          });
          assert.equal(first.status, 201, JSON.stringify(first.data));
          const created = first.data.studyLog as Log;
          assert.deepEqual(
            created.finishedContentIds,
            [ch1, s11, s12].sort((a, b) => a - b),
          );
          const fetched = (await call(`/api/study-logs/${created.id}`)).data.studyLog as Log;
          assert.deepEqual(fetched.finishedContentIds, created.finishedContentIds);
          const edited = await save(
            { studyDate: '8060-03-02', textbookId: book, finishedContentIds: [ch2] },
            'PUT',
            `/${created.id}`,
          );
          assert.deepEqual((edited.data.studyLog as Log).finishedContentIds, [ch2]);
          const cleared = await save(
            { studyDate: '8060-03-02', textbookId: book },
            'PUT',
            `/${created.id}`,
          );
          assert.deepEqual((cleared.data.studyLog as Log).finishedContentIds, []);
        });

        await t.test(
          'entries of another textbook, or without a textbook, are refused',
          async () => {
            const wrong = await save({
              studyDate: '8060-03-02',
              textbookId: book,
              finishedContentIds: [otherChapter],
            });
            assert.equal(wrong.status, 400);
            assert.match(String(wrong.data.error), /Contents entry not found/);
            const none = await save({ studyDate: '8060-03-02', finishedContentIds: [ch1] });
            assert.equal(none.status, 400);
            assert.match(String(none.data.error), /Choose a textbook/);
          },
        );

        await t.test(
          'chapters and sections are counted once, on their first done log',
          async () => {
            assert.equal((await stats(book)).chapters, 0);
            await save({
              studyDate: '8060-03-03',
              textbookId: book,
              finishedContentIds: [ch1, s11],
            });
            // The same entries again later, and a planned log, add nothing.
            await save({
              studyDate: '8060-03-05',
              textbookId: book,
              finishedContentIds: [ch1, s12],
            });
            await save({
              studyDate: '8060-03-06',
              textbookId: book,
              status: 'planned',
              finishedContentIds: [ch2],
            });
            const answer = await stats(book);
            assert.deepEqual([answer.totalChapters, answer.totalSections], [2, 2]);
            assert.deepEqual([answer.chapters, answer.sections], [1, 2]);
            assert.deepEqual([answer.cumulativeChapters, answer.cumulativeSections], [1, 2]);
            const day = (date: string) => answer.daily.find((item) => item.date === date);
            assert.deepEqual(day('8060-03-03'), { date: '8060-03-03', chapters: 1, sections: 1 });
            assert.deepEqual(day('8060-03-05'), { date: '8060-03-05', chapters: 0, sections: 1 });
            assert.deepEqual(day('8060-03-06'), { date: '8060-03-06', chapters: 0, sections: 0 });
            // The weeks hold the same entries once.
            assert.deepEqual(
              [
                answer.weekly.reduce((sum, week) => sum + week.chapters, 0),
                answer.weekly.reduce((sum, week) => sum + week.sections, 0),
              ],
              [1, 2],
            );
          },
        );

        await t.test('sections finished show per textbook and per day', async () => {
          const books = await call(`/api/stats/textbooks?textbookId=${book}`);
          assert.equal(books.status, 200, JSON.stringify(books.data));
          const row = (
            books.data.textbooks as { completedSections: number; totalSections: number }[]
          )[0];
          assert.deepEqual([row.completedSections, row.totalSections], [2, 2]);
          const days = await call('/api/stats/finished-days?from=8060-03-01&to=8060-03-10');
          assert.equal(days.status, 200, JSON.stringify(days.data));
          const daily = days.data.daily as { date: string; chapters: number; sections: number }[];
          assert.equal(daily.length, 10);
          assert.deepEqual(
            daily.find((day) => day.date === '8060-03-03'),
            { date: '8060-03-03', chapters: 1, sections: 1 },
          );
          const bad = await call('/api/stats/finished-days?from=8060-03-10&to=8060-03-01');
          assert.equal(bad.status, 400);
        });

        await t.test('a log on a date still to come does not count yet', async () => {
          await save({ studyDate: '8060-03-20', textbookId: book, finishedContentIds: [ch2] });
          assert.equal((await stats(book)).cumulativeChapters, 1);
          today = '8060-03-25';
          assert.equal((await stats(book)).cumulativeChapters, 2);
          today = '8060-03-10';
        });

        await t.test('another textbook has its own counts, and a missing one is 404', async () => {
          assert.deepEqual(
            [(await stats(other)).chapters, (await stats(other)).totalChapters],
            [0, 1],
          );
          const missing = await call('/api/stats/finished-contents?textbookId=999999999');
          assert.equal(missing.status, 404);
        });

        await t.test('an entry a log finished cannot be deleted', async () => {
          const refused = await call(`/api/textbooks/${book}/contents/${ch1}`, {
            method: 'DELETE',
          });
          assert.equal(refused.status, 409, JSON.stringify(refused.data));
        });
      },
      { today: () => today },
    );
  },
);
