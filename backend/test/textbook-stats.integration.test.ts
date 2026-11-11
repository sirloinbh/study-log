import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { holdExactTotalsLock, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Book = { id: number; title: string; completedChapters: number; totalChapters: number };
type Totals = {
  plannedMinutes: number;
  achievedMinutes: number;
  achievementRate: number | null;
  dueDays: number;
  onTimeDays: number;
  adherenceRate: number | null;
};
type Stats = { textbooks: Book[]; schedule: Totals };
type Detail = { schedule: { id: number }; items: { id: number; date: string }[] };

// #51. Requires a dedicated test DB with database/migrations applied. Year 8050 belongs to this test
// alone. It takes the lock the schedule tests take: the rates count every schedule there is.
test('textbooks and schedules are counted as the rules say', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const books: number[] = [];
  const cleanup = async () => {
    await pool.query(
      "DELETE FROM study_logs WHERE study_date BETWEEN '8050-01-01' AND '8050-12-31'",
    );
    await pool.query(
      "DELETE FROM schedules WHERE start_date BETWEEN '8050-01-01' AND '8050-12-31'",
    );
    await pool.query('DELETE FROM holiday_years WHERE year = 8050');
    await pool.query(
      "DELETE FROM holidays WHERE holiday_date BETWEEN '8050-01-01' AND '8050-12-31'",
    );
    if (books.length) await pool.query('DELETE FROM textbooks WHERE id = ANY($1)', [books]);
  };
  await holdExactTotalsLock(url, t, async () => {
    await cleanup();
    await pool.end();
  });
  await cleanup();

  let today = '8050-03-01';
  await withApi(
    pool,
    async (call) => {
      const book = async (title: string, chapters: number) => {
        const made = await call('/api/textbooks', { method: 'POST', body: { title } });
        const id = (made.data.textbook as { id: number }).id;
        books.push(id);
        const ids: number[] = [];
        for (let number = 1; number <= chapters; number++) {
          const content = await call(`/api/textbooks/${id}/contents`, {
            method: 'POST',
            body: { title: `${number}장` },
          });
          ids.push((content.data.content as { id: number }).id);
        }
        return { id, chapters: ids };
      };
      const log = async (
        textbookId: number,
        contentId: number,
        status: string,
        studyDate = '8050-03-01',
      ) => {
        const made = await call('/api/study-logs', {
          method: 'POST',
          body: {
            studyDate,
            startTime: '09:00',
            endTime: '10:00',
            status,
            textbookId,
            contentId,
          },
        });
        assert.equal(made.status, 201, JSON.stringify(made.data));
      };
      const stats = async (textbookId?: number) => {
        const answer = await call(
          `/api/stats/textbooks${textbookId ? `?textbookId=${textbookId}` : ''}`,
        );
        assert.equal(answer.status, 200, JSON.stringify(answer.data));
        return answer.data as unknown as Stats;
      };
      const row = (all: Stats, id: number) => all.textbooks.find((item) => item.id === id);

      const math = await book('통계 수학', 3);
      const physics = await book('통계 물리', 2);
      const empty = await book('통계 빈 책', 0);
      const empty2 = await book('통계 다시 여는 책', 1);

      await t.test('a chapter is done by a done log on it or on a section under it', async () => {
        assert.equal(row(await stats(), math.id)?.completedChapters, 0);
        assert.equal(row(await stats(), math.id)?.totalChapters, 3);
        await log(math.id, math.chapters[0], 'done');
        assert.equal(row(await stats(), math.id)?.completedChapters, 1);
        // Two done logs on one chapter count once.
        await log(math.id, math.chapters[0], 'done');
        assert.equal(row(await stats(), math.id)?.completedChapters, 1);
        // A log not done does not count.
        await log(math.id, math.chapters[1], 'planned');
        await log(math.id, math.chapters[1], 'in_progress');
        await log(math.id, math.chapters[1], 'stopped');
        assert.equal(row(await stats(), math.id)?.completedChapters, 1);
        // Done on a date still to come does not count yet, as in the other statistics.
        await log(math.id, math.chapters[2], 'done', '8050-03-02');
        assert.equal(row(await stats(), math.id)?.completedChapters, 1);
        today = '8050-03-02';
        assert.equal(row(await stats(), math.id)?.completedChapters, 2);
        today = '8050-03-01';
        // A section two levels down counts for its chapter, and sections are not chapters.
        const section = await call(`/api/textbooks/${math.id}/contents`, {
          method: 'POST',
          body: { parentId: math.chapters[1], title: '2.1' },
        });
        const sectionId = (section.data.content as { id: number }).id;
        const deep = await call(`/api/textbooks/${math.id}/contents`, {
          method: 'POST',
          body: { parentId: sectionId, title: '2.1.1' },
        });
        await log(math.id, (deep.data.content as { id: number }).id, 'done');
        const after = row(await stats(), math.id);
        assert.equal(after?.completedChapters, 2);
        assert.equal(after?.totalChapters, 3);
        today = '8050-03-02';
        assert.equal(row(await stats(), math.id)?.completedChapters, 3);
        today = '8050-03-01';
        // Other books are not touched, and a book with no contents has nothing to count.
        assert.equal(row(await stats(), physics.id)?.completedChapters, 0);
        assert.deepEqual(
          [
            row(await stats(), empty.id)?.completedChapters,
            row(await stats(), empty.id)?.totalChapters,
          ],
          [0, 0],
        );
      });

      await t.test('with nothing due the rates are empty, not zero', async () => {
        const { schedule } = await stats();
        assert.deepEqual(schedule, {
          plannedMinutes: 0,
          achievedMinutes: 0,
          achievementRate: null,
          dueDays: 0,
          onTimeDays: 0,
          adherenceRate: null,
        });
      });

      await t.test('rates count against the date first planned, however days moved', async () => {
        today = '8050-03-01';
        // 8050-03-01 is a Tuesday: every day here takes 60 minutes, or 120 on a rest day.
        const made = await call('/api/schedules', {
          method: 'POST',
          body: {
            title: '통계 일정',
            startDate: '8050-03-01',
            endDate: '8050-03-04',
            weekdayMinutes: 60,
            restDayMinutes: 120,
            chapters: { textbookId: math.id },
          },
        });
        assert.equal(made.status, 201, JSON.stringify(made.data));
        const { schedule, items } = made.data as unknown as Detail;
        const complete = (item: number) =>
          call(`/api/schedules/${schedule.id}/items/${item}/complete`, { method: 'POST' });

        // Day 1 is due today and not late yet, so nothing counts.
        assert.equal((await stats()).schedule.dueDays, 0);
        // Done on the day: on time.
        await complete(items[0].id);
        let { schedule: totals } = await stats();
        assert.deepEqual(
          [totals.dueDays, totals.onTimeDays, totals.adherenceRate, totals.achievementRate],
          [1, 1, 100, 100],
        );
        // A day ahead of plan done early: not due yet, so not counted before its date.
        await complete(items[1].id);
        totals = (await stats()).schedule;
        assert.equal(totals.dueDays, 1);
        assert.equal(totals.plannedMinutes, 60);

        // Two days on: day 2 was on time; day 3 is due and still open. Reading moves it, and the
        // count stays with its first date.
        today = '8050-03-03';
        await call(`/api/schedules/${schedule.id}`);
        totals = (await stats()).schedule;
        assert.equal(totals.dueDays, 2);
        assert.equal(totals.onTimeDays, 2);
        today = '8050-03-04';
        await call(`/api/schedules/${schedule.id}`);
        totals = (await stats()).schedule;
        // Day 3 (first planned for 03-03) is past and open.
        assert.equal(totals.dueDays, 3);
        assert.equal(totals.onTimeDays, 2);
        assert.equal(totals.adherenceRate, 66);
        assert.equal(totals.plannedMinutes, 180);
        assert.equal(totals.achievedMinutes, 120);
        assert.equal(totals.achievementRate, 66);

        // Done late: achieved now, but not on time.
        await complete(items[2].id);
        totals = (await stats()).schedule;
        assert.equal(totals.achievedMinutes, 180);
        assert.equal(totals.achievementRate, 100);
        assert.equal(totals.onTimeDays, 2);
        assert.equal(totals.adherenceRate, 66);
      });

      await t.test('moving a day by hand does not change what it is counted against', async () => {
        today = '8050-04-04';
        const made = await call('/api/schedules', {
          method: 'POST',
          body: {
            title: '통계 일정 물리',
            startDate: '8050-04-04',
            endDate: '8050-04-05',
            weekdayMinutes: 60,
            restDayMinutes: 60,
            chapters: { textbookId: physics.id },
          },
        });
        const { schedule, items } = made.data as unknown as Detail;
        const moved = await call(`/api/schedules/${schedule.id}/items/${items[0].id}/date`, {
          method: 'PUT',
          body: { date: '8050-04-20' },
        });
        assert.equal(moved.status, 200);
        today = '8050-04-10';
        const { schedule: totals } = await stats(physics.id);
        // Both first planned before today, neither done.
        assert.equal(totals.dueDays, 2);
        assert.equal(totals.onTimeDays, 0);
        assert.equal(totals.adherenceRate, 0);
        assert.equal(totals.achievementRate, 0);
      });

      await t.test('reopening a day takes it out of what was done on time', async () => {
        today = '8050-05-02';
        const made = await call('/api/schedules', {
          method: 'POST',
          body: {
            title: '다시 여는 일정',
            startDate: '8050-05-02',
            endDate: '8050-05-02',
            weekdayMinutes: 60,
            restDayMinutes: 60,
            chapters: { textbookId: empty2.id },
          },
        });
        const { schedule, items } = made.data as unknown as Detail;
        const path = `/api/schedules/${schedule.id}/items/${items[0].id}`;
        await call(`${path}/complete`, { method: 'POST' });
        assert.deepEqual(
          (({ dueDays, onTimeDays }) => [dueDays, onTimeDays])((await stats(empty2.id)).schedule),
          [1, 1],
        );
        await call(`${path}/reopen`, { method: 'POST' });
        // Open again and due today: not late yet, and not counted.
        assert.equal((await stats(empty2.id)).schedule.dueDays, 0);
        today = '8050-05-03';
        const late = (await stats(empty2.id)).schedule;
        assert.deepEqual([late.dueDays, late.onTimeDays, late.adherenceRate], [1, 0, 0]);
        today = '8050-05-04';
        await call(`/api/schedules/${schedule.id}`, { method: 'DELETE' });
      });

      await t.test('a book narrows both the books and the rates', async () => {
        today = '8050-04-10';
        const narrowed = await stats(physics.id);
        assert.deepEqual(
          narrowed.textbooks.map((item) => item.id),
          [physics.id],
        );
        assert.equal(narrowed.schedule.plannedMinutes, 120);
        const everything = await stats();
        assert.ok(everything.textbooks.length >= 3);
        // Everything is the sum of the two schedules, all of their days past by now.
        assert.equal(everything.schedule.plannedMinutes, 240 + 120);
        // Some book with no schedule has nothing due.
        assert.equal((await stats(empty.id)).schedule.dueDays, 0);
      });

      await t.test('a wrong or missing book is said so', async () => {
        for (const query of ['textbookId=abc', 'textbookId=', 'textbookId=1&textbookId=2']) {
          const wrong = await call(`/api/stats/textbooks?${query}`);
          assert.equal(wrong.status, 400, query);
          assert.match(String(wrong.data.error), /Invalid textbook ID/);
        }
        const none = await call('/api/stats/textbooks?textbookId=999999999999');
        assert.equal(none.status, 404);
        assert.match(String(none.data.error), /Textbook not found/);
      });
    },
    {
      today: () => today,
      holidayFetcher: async (year) => [{ date: `${year}-12-25`, name: '기독탄신일' }],
    },
  );
});
