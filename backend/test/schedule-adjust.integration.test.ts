import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { holdExactTotalsLock, withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Item = { id: number; date: string; targetMinutes: number; completedOn: string | null };
type Summary = { id: number; endDate: string; currentEndDate: string; delayDays: number };
type Detail = { schedule: Summary; items: Item[] };

// #37. Requires a dedicated test DB with database/migrations applied. Years 8041 and 8042 belong to
// this test alone. Every day here has 60 minutes, so an item exists for each date.
test('a schedule follows what was done and what fell behind', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const books: number[] = [];
  const cleanup = async () => {
    await pool.query(
      "DELETE FROM schedules WHERE start_date BETWEEN '8041-01-01' AND '8042-12-31'",
    );
    if (books.length) await pool.query('DELETE FROM textbooks WHERE id = ANY($1)', [books]);
    await pool.query('DELETE FROM holiday_years WHERE year BETWEEN 8041 AND 8042');
    await pool.query(
      "DELETE FROM holidays WHERE holiday_date BETWEEN '8041-01-01' AND '8042-12-31'",
    );
  };
  // Reading the list moves every schedule behind by its "today", and each test has its own.
  await holdExactTotalsLock(url, t, async () => {
    await cleanup();
    await pool.end();
  });
  await cleanup();

  let today = '8041-03-01';
  await withApi(
    pool,
    async (call) => {
      const make = async (startDate: string, endDate: string) => {
        const made = await call('/api/schedules', {
          method: 'POST',
          body: { title: '조정', startDate, endDate, weekdayMinutes: 60, restDayMinutes: 60 },
        });
        assert.equal(made.status, 201, JSON.stringify(made.data));
        return made.data as unknown as Detail;
      };
      const read = async (id: number) => {
        const answer = await call(`/api/schedules/${id}`);
        assert.equal(answer.status, 200);
        return answer.data as unknown as Detail;
      };
      const complete = (id: number, item: number) =>
        call(`/api/schedules/${id}/items/${item}/complete`, { method: 'POST' });
      const reopen = (id: number, item: number) =>
        call(`/api/schedules/${id}/items/${item}/reopen`, { method: 'POST' });
      const move = (id: number, item: number, date: string, withLater?: boolean) =>
        call(`/api/schedules/${id}/items/${item}/date`, {
          method: 'PUT',
          body: { date, ...(withLater === undefined ? {} : { withLater }) },
        });
      const dates = (detail: Detail) => detail.items.map((item) => item.date);

      await t.test('nothing moves while nothing is behind', async () => {
        today = '8041-03-01';
        const { schedule } = await make('8041-03-01', '8041-03-03');
        today = '8041-03-01';
        const detail = await read(schedule.id);
        assert.deepEqual(dates(detail), ['8041-03-01', '8041-03-02', '8041-03-03']);
        assert.equal(detail.schedule.delayDays, 0);
        assert.equal(detail.schedule.currentEndDate, '8041-03-03');
      });

      await t.test('falling behind moves every open day by the same days', async () => {
        today = '8041-04-01';
        const { schedule, items } = await make('8041-04-01', '8041-04-04');
        // The first day is done; the second is not, and two days pass after it.
        assert.equal((await complete(schedule.id, items[0].id)).status, 200);
        today = '8041-04-04';
        const detail = await read(schedule.id);
        assert.deepEqual(dates(detail), ['8041-04-01', '8041-04-04', '8041-04-05', '8041-04-06']);
        assert.equal(detail.items[0].completedOn, '8041-04-01');
        assert.equal(detail.schedule.endDate, '8041-04-04');
        assert.equal(detail.schedule.currentEndDate, '8041-04-06');
        assert.equal(detail.schedule.delayDays, 2);
        // Read again the same day: already caught up.
        assert.deepEqual(dates(await read(schedule.id)), dates(detail));
      });

      await t.test('the list moves them too, and a moved gap stays', async () => {
        today = '8041-05-01';
        const { schedule, items } = await make('8041-05-01', '8041-05-03');
        // Moved by hand: 05-01, 05-02, then a gap to 05-10.
        assert.equal((await move(schedule.id, items[2].id, '8041-05-10')).status, 200);
        today = '8041-05-04';
        const list = await call('/api/schedules');
        const row = (list.data.schedules as Summary[]).find((item) => item.id === schedule.id);
        assert.equal(row?.delayDays, 3 + 7);
        // Three days behind: 05-01 → 05-04, 05-02 → 05-05, 05-10 → 05-13.
        assert.equal(row?.currentEndDate, '8041-05-13');
        today = '8041-05-04';
        assert.deepEqual(dates(await read(schedule.id)), [
          '8041-05-04',
          '8041-05-05',
          '8041-05-13',
        ]);
      });

      await t.test('days still ahead never come forward', async () => {
        today = '8042-02-01';
        const { schedule, items } = await make('8042-02-10', '8042-02-11');
        // Neither reading nor changing a day pulls them to today.
        assert.deepEqual(dates(await read(schedule.id)), ['8042-02-10', '8042-02-11']);
        await call('/api/schedules');
        const done = await complete(schedule.id, items[1].id);
        assert.deepEqual(dates(done.data as unknown as Detail), ['8042-02-10', '8042-02-11']);
      });

      await t.test('two reads at once move it only once', async () => {
        today = '8041-06-01';
        const { schedule } = await make('8041-06-01', '8041-06-02');
        today = '8041-06-05';
        await Promise.all([read(schedule.id), read(schedule.id), call('/api/schedules')]);
        assert.deepEqual(dates(await read(schedule.id)), ['8041-06-05', '8041-06-06']);
      });

      await t.test('a read that waits for another one does not move it again', async () => {
        today = '8042-03-01';
        const { schedule } = await make('8042-03-01', '8042-03-02');
        today = '8042-03-05';
        // Another read in the middle of moving it, not committed yet. The request's own check
        // still sees the days behind, so only taking the lock first keeps it from moving them too.
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT 1 FROM schedules WHERE id = $1 FOR UPDATE', [schedule.id]);
          await client.query(
            'UPDATE schedule_items SET item_date = item_date + 4 WHERE schedule_id = $1',
            [schedule.id],
          );
          const waiting = read(schedule.id);
          for (let tries = 0; tries < 200; tries++) {
            const { rowCount } = await pool.query(
              `SELECT 1 FROM pg_stat_activity
               WHERE datname = current_database() AND wait_event_type = 'Lock'
                 AND (query LIKE '%schedules WHERE id = $1 FOR UPDATE%'
                   OR query LIKE '%UPDATE schedule_items i%')`,
            );
            if (rowCount) break;
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          await client.query('COMMIT');
          assert.deepEqual(dates(await waiting), ['8042-03-05', '8042-03-06']);
        } finally {
          await client.query('ROLLBACK').catch(() => undefined);
          client.release();
        }
      });

      await t.test('a completed day cannot be completed or moved, until reopened', async () => {
        today = '8041-07-01';
        const { schedule, items } = await make('8041-07-01', '8041-07-02');
        const done = await complete(schedule.id, items[0].id);
        const doneItem = (done.data as unknown as Detail).items[0];
        assert.equal(doneItem.completedOn, '8041-07-01');
        const again = await complete(schedule.id, items[0].id);
        assert.equal(again.status, 409);
        assert.match(String(again.data.error), /이미 완료한/);
        const moved = await move(schedule.id, items[0].id, '8041-07-09');
        assert.equal(moved.status, 409);
        assert.match(String(moved.data.error), /완료한 항목은 옮길 수 없습니다/);
        const open = await reopen(schedule.id, items[1].id);
        assert.equal(open.status, 409);
        assert.match(String(open.data.error), /완료하지 않은/);
        assert.equal((await reopen(schedule.id, items[0].id)).status, 200);
        assert.equal((await read(schedule.id)).items[0].completedOn, null);
      });

      await t.test('reopening a day in the past brings only that day to today', async () => {
        today = '8041-08-01';
        const { schedule, items } = await make('8041-08-01', '8041-08-30');
        await complete(schedule.id, items[0].id);
        today = '8041-08-20';
        // Everything left has fallen behind by nineteen days by now, and is moved first.
        const before = await read(schedule.id);
        const byIdBefore = new Map(before.items.map((item) => [item.id, item.date]));
        assert.equal(byIdBefore.get(items[1].id), '8041-08-20');
        const answer = await reopen(schedule.id, items[0].id);
        assert.equal(answer.status, 200);
        const detail = answer.data as unknown as Detail;
        const byId = new Map(detail.items.map((item) => [item.id, item]));
        assert.equal(byId.get(items[0].id)?.date, '8041-08-20');
        assert.equal(byId.get(items[0].id)?.completedOn, null);
        for (const item of items.slice(1))
          assert.equal(byId.get(item.id)?.date, byIdBefore.get(item.id));
        // A day not yet come stays where it is.
        today = '8041-08-20';
        const ahead = await make('8041-08-25', '8041-08-26');
        await complete(ahead.schedule.id, ahead.items[1].id);
        const reopened = await reopen(ahead.schedule.id, ahead.items[1].id);
        assert.deepEqual(dates(reopened.data as unknown as Detail), ['8041-08-25', '8041-08-26']);
      });

      await t.test('moving keeps the target and chapters, and days can share a date', async () => {
        today = '8042-04-01';
        const book = await call('/api/textbooks', { method: 'POST', body: { title: '조정 교재' } });
        const bookId = (book.data.textbook as { id: number }).id;
        books.push(bookId);
        await call(`/api/textbooks/${bookId}/contents`, { method: 'POST', body: { title: '1장' } });
        await call(`/api/textbooks/${bookId}/contents`, { method: 'POST', body: { title: '2장' } });
        const made = await call('/api/schedules', {
          method: 'POST',
          body: {
            title: '장 있는 일정',
            startDate: '8042-04-01',
            endDate: '8042-04-04',
            weekdayMinutes: 60,
            restDayMinutes: 60,
            chapters: { textbookId: bookId },
          },
        });
        const { schedule, items } = made.data as unknown as Detail & {
          items: { contents: unknown[] }[];
        };
        type Full = { items: (Item & { contents: { title: string }[] })[] };
        const shape = (detail: Full) =>
          new Map(
            detail.items.map((item) => [
              item.id,
              [item.targetMinutes, item.contents.map((c) => c.title).join()].join('/'),
            ]),
          );
        const original = shape(made.data as unknown as Full);
        // By hand, with those after it, then behind by days: none of it changes what a day holds.
        await move(schedule.id, items[3].id, '8042-04-02');
        await move(schedule.id, items[1].id, '8042-04-10', true);
        today = '8042-04-05';
        const after = await read(schedule.id);
        assert.deepEqual(shape(after as unknown as Full), original);

        // 04-02 now holds items 2 and 3... those on the same date go along with the one moved.
        today = '8042-05-01';
        const fresh = await make('8042-05-01', '8042-05-03');
        await move(fresh.schedule.id, fresh.items[2].id, '8042-05-02');
        const together = await move(fresh.schedule.id, fresh.items[1].id, '8042-05-05', true);
        const byId = new Map((together.data as unknown as Detail).items.map((i) => [i.id, i.date]));
        assert.equal(byId.get(fresh.items[1].id), '8042-05-05');
        assert.equal(byId.get(fresh.items[2].id), '8042-05-05');
        assert.equal(byId.get(fresh.items[0].id), '8042-05-01');
      });

      await t.test('a day moved before the start, and everything done', async () => {
        today = '8042-06-01';
        const { schedule, items } = await make('8042-06-10', '8042-06-12');
        const early = await move(schedule.id, items[0].id, '8042-06-02');
        assert.equal(early.status, 200);
        const summary = (early.data as unknown as Detail).schedule;
        assert.equal(summary.endDate, '8042-06-12');
        assert.equal(summary.currentEndDate, '8042-06-12');
        assert.equal(summary.delayDays, 0);
        for (const item of items) assert.equal((await complete(schedule.id, item.id)).status, 200);
        today = '8042-07-01';
        const done = await read(schedule.id);
        // Nothing open, so nothing moves however late it is.
        assert.deepEqual(dates(done), ['8042-06-02', '8042-06-11', '8042-06-12']);
        assert.equal(done.schedule.delayDays, 0);
      });

      await t.test('a refused change takes the catching up back too', async () => {
        today = '8042-08-03';
        const { schedule, items } = await make('8042-08-03', '8042-08-04');
        today = '8042-08-06';
        const refused = await move(schedule.id, items[0].id, '8042-08-05');
        assert.equal(refused.status, 400);
        const rows = await pool.query<{ date: string }>(
          `SELECT to_char(item_date, 'YYYY-MM-DD') AS date FROM schedule_items
           WHERE schedule_id = $1 ORDER BY item_date`,
          [schedule.id],
        );
        assert.deepEqual(
          rows.rows.map((row) => row.date),
          ['8042-08-03', '8042-08-04'],
        );
      });

      await t.test('days taken along stay within the limit as well', async () => {
        today = '8042-09-01';
        const { schedule, items } = await make('8042-09-01', '8042-09-02');
        // 729 days on takes the next one to 730 days on, counted with today: the last allowed.
        const lastAllowed = '8044-08-30';
        const edge = await move(schedule.id, items[0].id, lastAllowed, true);
        assert.equal(edge.status, 400);
        assert.match(String(edge.data.error), /함께 옮기는 일정도/);
        const fits = await move(schedule.id, items[0].id, '8044-08-29', true);
        assert.equal(fits.status, 200, JSON.stringify(fits.data));
        assert.deepEqual(dates(fits.data as unknown as Detail), ['8044-08-29', '8044-08-30']);
      });

      await t.test('one day moves alone, either way; later days only when asked', async () => {
        today = '8041-09-01';
        const { schedule, items } = await make('8041-09-01', '8041-09-04');
        const later = await move(schedule.id, items[1].id, '8041-09-20');
        assert.equal(later.status, 200);
        assert.deepEqual(dates(later.data as unknown as Detail), [
          '8041-09-01',
          '8041-09-03',
          '8041-09-04',
          '8041-09-20',
        ]);
        // Forward, to today at the earliest.
        const sooner = await move(schedule.id, items[3].id, '8041-09-02');
        assert.equal(sooner.status, 200);
        assert.deepEqual(dates(sooner.data as unknown as Detail), [
          '8041-09-01',
          '8041-09-02',
          '8041-09-03',
          '8041-09-20',
        ]);
      });

      await t.test('a day moved with those after it keeps the gaps, done days stay', async () => {
        today = '8041-10-01';
        const { schedule, items } = await make('8041-10-01', '8041-10-05');
        await complete(schedule.id, items[3].id);
        // Back by three days from 10-02: 10-02, 10-03, 10-05 go; 10-01 and the done 10-04 stay.
        const pushed = await move(schedule.id, items[1].id, '8041-10-05', true);
        assert.equal(pushed.status, 200);
        let byId = new Map((pushed.data as unknown as Detail).items.map((i) => [i.id, i.date]));
        assert.equal(byId.get(items[0].id), '8041-10-01');
        assert.equal(byId.get(items[1].id), '8041-10-05');
        assert.equal(byId.get(items[2].id), '8041-10-06');
        assert.equal(byId.get(items[3].id), '8041-10-04');
        assert.equal(byId.get(items[4].id), '8041-10-08');
        // And forward again by two, never before today.
        const pulled = await move(schedule.id, items[1].id, '8041-10-03', true);
        assert.equal(pulled.status, 200);
        byId = new Map((pulled.data as unknown as Detail).items.map((i) => [i.id, i.date]));
        assert.equal(byId.get(items[1].id), '8041-10-03');
        assert.equal(byId.get(items[2].id), '8041-10-04');
        assert.equal(byId.get(items[4].id), '8041-10-06');
        assert.equal(byId.get(items[0].id), '8041-10-01');
      });

      await t.test('a date that cannot work is refused and changes nothing', async () => {
        today = '8041-11-02';
        const { schedule, items } = await make('8041-11-02', '8041-11-03');
        const before = dates(await read(schedule.id));
        const past = await move(schedule.id, items[0].id, '8041-11-01');
        assert.equal(past.status, 400);
        assert.match(String(past.data.error), /오늘 이후/);
        const far = await move(schedule.id, items[0].id, '8043-11-02');
        assert.equal(far.status, 400);
        assert.match(String(far.data.error), /730일/);
        // The 730th day counting today, one before the one refused above.
        const edge = await move(schedule.id, items[1].id, '8043-11-01');
        assert.equal(edge.status, 200, JSON.stringify(edge.data));
        await move(schedule.id, items[1].id, '8041-11-03');
        assert.deepEqual(dates(await read(schedule.id)), before);
        for (const [path, method, body] of [
          [`/api/schedules/${schedule.id}/items/${items[0].id}/date`, 'PUT', { date: '내일' }],
          [`/api/schedules/${schedule.id}/items/${items[0].id}/date`, 'PUT', {}],
          [
            `/api/schedules/${schedule.id}/items/${items[0].id}/date`,
            'PUT',
            { date: '8041-11-05', withLater: 'yes' },
          ],
          [`/api/schedules/${schedule.id}/items/abc/complete`, 'POST', undefined],
          [`/api/schedules/abc/items/${items[0].id}/complete`, 'POST', undefined],
        ] as const) {
          assert.equal((await call(path, { method, body })).status, 400, path);
        }
      });

      await t.test('an item of another schedule or none is 404', async () => {
        today = '8042-01-04';
        const first = await make('8042-01-04', '8042-01-05');
        const second = await make('8042-01-04', '8042-01-05');
        const wrong = await complete(first.schedule.id, second.items[0].id);
        assert.equal(wrong.status, 404);
        assert.match(String(wrong.data.error), /일정 항목을 찾을 수 없습니다/);
        assert.equal((await read(second.schedule.id)).items[0].completedOn, null);
        const none = await complete(999_999_999_999, second.items[0].id);
        assert.equal(none.status, 404);
        assert.match(String(none.data.error), /일정을 찾을 수 없습니다/);
      });
    },
    {
      today: () => today,
      holidayFetcher: async (year) => [{ date: `${year}-12-25`, name: '기독탄신일' }],
    },
  );
});
