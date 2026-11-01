import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Chapter = { id: number; number: string; title: string };
type Item = { date: string; targetMinutes: number; contents: Chapter[] };
type Detail = {
  schedule: { id: number; textbookId: number | null; textbookTitle: string | null };
  items: Item[];
};

// #36. Requires a dedicated test DB with database/migrations applied. Years 8039 and 8040 belong to
// this test alone. 8039-03-07 is a Monday, so 03-12 and 03-13 are the weekend.
test('a book is laid out over a schedule, chapter by chapter', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const books: number[] = [];
  const cleanup = async () => {
    await pool.query(
      "DELETE FROM schedules WHERE start_date BETWEEN '8039-01-01' AND '8040-12-31'",
    );
    await pool.query('DELETE FROM holiday_years WHERE year BETWEEN 8039 AND 8040');
    await pool.query(
      "DELETE FROM holidays WHERE holiday_date BETWEEN '8039-01-01' AND '8040-12-31'",
    );
    if (books.length) await pool.query('DELETE FROM textbooks WHERE id = ANY($1)', [books]);
  };
  t.after(async () => {
    await cleanup();
    await pool.end();
  });
  await cleanup();

  let holidayCalls = 0;
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
            body: { number: String(number), title: `${number}장` },
          });
          ids.push((content.data.content as { id: number }).id);
        }
        return { id, chapters: ids };
      };
      const body = (chapters: unknown, startDate = '8039-03-07', endDate = '8039-03-13') => ({
        title: '장 단위 일정',
        startDate,
        endDate,
        weekdayMinutes: 120,
        restDayMinutes: 300,
        chapters,
      });
      const create = (input: unknown) => call('/api/schedules', { method: 'POST', body: input });
      const titles = (detail: Detail) =>
        detail.items.map((item) => item.contents.map((chapter) => chapter.title));

      const four = await book('네 장짜리 책', 4);

      await t.test('the example of the rules, from the whole book', async () => {
        // Monday to Sunday: 2·2·2·2·2·5·5 hours.
        const made = await create(body({ textbookId: four.id }));
        assert.equal(made.status, 201, JSON.stringify(made.data));
        const detail = made.data as unknown as Detail;
        assert.deepEqual(titles(detail), [
          ['1장'],
          ['1장'],
          ['1장', '2장'],
          ['2장'],
          ['2장'],
          ['3장'],
          ['4장'],
        ]);
        assert.equal(detail.schedule.textbookId, four.id);
        assert.equal(detail.schedule.textbookTitle, '네 장짜리 책');
        assert.deepEqual(
          { ...detail.items[0].contents[0], id: 0 },
          { id: 0, number: '1', title: '1장' },
        );
        // And the same when read again.
        const read = await call(`/api/schedules/${detail.schedule.id}`);
        assert.deepEqual(titles(read.data as unknown as Detail), titles(detail));
      });

      await t.test('a range holds only its chapters, whichever end is given', async () => {
        const [first, second, third] = four.chapters;
        const middle = await create(
          body({ textbookId: four.id, fromContentId: second, toContentId: third }),
        );
        assert.deepEqual(
          [...new Set(titles(middle.data as unknown as Detail).flat())],
          ['2장', '3장'],
        );
        const fromSecond = await create(body({ textbookId: four.id, fromContentId: second }));
        assert.deepEqual(
          [...new Set(titles(fromSecond.data as unknown as Detail).flat())],
          ['2장', '3장', '4장'],
        );
        const upToSecond = await create(body({ textbookId: four.id, toContentId: second }));
        assert.deepEqual(
          [...new Set(titles(upToSecond.data as unknown as Detail).flat())],
          ['1장', '2장'],
        );
        const one = await create(
          body({ textbookId: four.id, fromContentId: first, toContentId: first }),
        );
        assert.ok(titles(one.data as unknown as Detail).every((day) => day.join() === '1장'));
      });

      await t.test('days with no time hold no chapters, and more chapters fit in', async () => {
        // Weekdays only: Saturday and Sunday have no items at all.
        const made = await create(body({ textbookId: four.id }, '8039-03-10', '8039-03-13'));
        assert.equal(made.status, 201);
        const weekdaysOnly = await create({
          ...body({ textbookId: four.id }, '8039-03-10', '8039-03-13'),
          restDayMinutes: 0,
        });
        // Thursday and Friday.
        assert.deepEqual(titles(weekdaysOnly.data as unknown as Detail), [
          ['1장', '2장'],
          ['3장', '4장'],
        ]);
      });

      await t.test('a schedule without a book holds no chapters', async () => {
        const made = await create(body(undefined));
        assert.equal(made.status, 201);
        const detail = made.data as unknown as Detail;
        assert.equal(detail.schedule.textbookId, null);
        assert.equal(detail.schedule.textbookTitle, null);
        assert.ok(detail.items.every((item) => item.contents.length === 0));
      });

      await t.test('a range that cannot work is refused before reading holidays', async () => {
        const empty = await book('목차 없는 책', 0);
        const other = await book('다른 책', 1);
        const section = await call(`/api/textbooks/${four.id}/contents`, {
          method: 'POST',
          body: { parentId: four.chapters[0], title: '1절' },
        });
        const sectionId = (section.data.content as { id: number }).id;
        const [first, second] = four.chapters;
        const cases: [unknown, RegExp][] = [
          [{ textbookId: 999_999_999_999 }, /교재를 찾을 수 없습니다/],
          [{ textbookId: empty.id }, /목차에 장이 없어/],
          [{ textbookId: four.id, fromContentId: other.chapters[0] }, /장을 찾을 수 없습니다/],
          [{ textbookId: four.id, toContentId: sectionId }, /장을 찾을 수 없습니다/],
          [
            { textbookId: four.id, fromContentId: second, toContentId: first },
            /마지막 장은 첫 장 이후/,
          ],
          [{ textbookId: 'x' }, /교재 ID가 올바르지 않습니다/],
          ['책', /장 범위를 JSON 객체로/],
        ];
        for (const [chapters, message] of cases) {
          const before = holidayCalls;
          const refused = await create(body(chapters, '8040-03-05', '8040-03-06'));
          assert.equal(refused.status, 400, JSON.stringify(chapters));
          assert.match(String(refused.data.error), message);
          assert.equal(holidayCalls, before);
        }
        const none = await pool.query("SELECT 1 FROM schedules WHERE start_date = '8040-03-05'");
        assert.equal(none.rowCount, 0);
      });

      await t.test('a book or chapter in a schedule stays until the schedule goes', async () => {
        const kept = await book('일정에 쓴 책', 2);
        const made = await create(body({ textbookId: kept.id }));
        const scheduleId = (made.data as unknown as Detail).schedule.id;

        const blockedBook = await call(`/api/textbooks/${kept.id}`, { method: 'DELETE' });
        assert.equal(blockedBook.status, 409);
        assert.equal(
          blockedBook.data.error,
          '학습 기록이나 일정이 연결된 교재는 삭제할 수 없습니다',
        );
        const blockedChapter = await call(
          `/api/textbooks/${kept.id}/contents/${kept.chapters[0]}`,
          { method: 'DELETE' },
        );
        assert.equal(blockedChapter.status, 409);
        assert.equal(
          blockedChapter.data.error,
          '학습 기록이나 일정이 연결된 목차는 삭제할 수 없습니다',
        );

        // A chapter added later is not laid out afterwards.
        await call(`/api/textbooks/${kept.id}/contents`, {
          method: 'POST',
          body: { title: '새 장' },
        });
        const again = await call(`/api/schedules/${scheduleId}`);
        assert.ok(
          !titles(again.data as unknown as Detail)
            .flat()
            .includes('새 장'),
        );

        assert.equal(
          (await call(`/api/schedules/${scheduleId}`, { method: 'DELETE' })).status,
          204,
        );
        const removed = await call(`/api/textbooks/${kept.id}`, { method: 'DELETE' });
        assert.equal(removed.status, 204);
        books.splice(books.indexOf(kept.id), 1);
      });
    },
    {
      today: () => '8039-01-01',
      holidayFetcher: async (year) => {
        holidayCalls += 1;
        return [{ date: `${year}-01-01`, name: '1월1일' }];
      },
    },
  );
});
