import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { HolidayError, type HolidayFetcher } from '../src/holidays.js';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Item = { id: number; date: string; targetMinutes: number };
type Summary = {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  weekdayMinutes: number;
  restDayMinutes: number;
  totalMinutes: number;
  itemCount: number;
};
type Detail = { schedule: Summary; items: Item[] };

// #34. Requires a dedicated test DB with database/migrations applied. Years 8034 to 8037 belong to
// this test alone. 8034-03-01 is a Wednesday, and a holiday here; 03-04 and 03-05 are the weekend.
test(
  'schedules are created from the holidays and read, renamed and deleted',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const cleanup = async () => {
      await pool.query(
        "DELETE FROM schedules WHERE start_date BETWEEN '8034-01-01' AND '8037-12-31'",
      );
      await pool.query('DELETE FROM holiday_years WHERE year BETWEEN 8034 AND 8038');
      await pool.query(
        "DELETE FROM holidays WHERE holiday_date BETWEEN '8034-01-01' AND '8038-12-31'",
      );
    };
    t.after(async () => {
      await cleanup();
      await pool.end();
    });
    await cleanup();

    let today = '8034-03-01';
    const asked: number[] = [];
    let answer: HolidayFetcher = async (year) => [
      { date: `${year}-01-01`, name: '1월1일' },
      { date: `${year}-03-01`, name: '삼일절' },
    ];
    const holidayFetcher: HolidayFetcher = (year) => {
      asked.push(year);
      return answer(year);
    };
    const body = (
      startDate: string,
      endDate: string,
      weekdayMinutes = 120,
      restDayMinutes = 300,
    ) => ({
      title: '알고리즘 일정',
      startDate,
      endDate,
      weekdayMinutes,
      restDayMinutes,
    });
    const rowsOf = async (table: string, where: string, value: unknown) =>
      (await pool.query(`SELECT 1 FROM ${table} WHERE ${where}`, [value])).rowCount;

    await withApi(
      pool,
      async (call) => {
        const create = (input: unknown) => call('/api/schedules', { method: 'POST', body: input });
        const created = async (input: unknown) => {
          const { status, data } = await create(input);
          assert.equal(status, 201, JSON.stringify(data));
          return data as unknown as Detail;
        };
        let firstId = 0;

        await t.test('each day takes the amount of its kind, starting today', async () => {
          const { schedule, items } = await created(body('8034-03-01', '8034-03-06'));
          firstId = schedule.id;
          assert.deepEqual(
            items.map((item) => [item.date, item.targetMinutes]),
            [
              ['8034-03-01', 300],
              ['8034-03-02', 120],
              ['8034-03-03', 120],
              ['8034-03-04', 300],
              ['8034-03-05', 300],
              ['8034-03-06', 120],
            ],
          );
          assert.deepEqual(
            { ...schedule, id: 0 },
            {
              id: 0,
              title: '알고리즘 일정',
              startDate: '8034-03-01',
              endDate: '8034-03-06',
              weekdayMinutes: 120,
              restDayMinutes: 300,
              textbookId: null,
              textbookTitle: null,
              totalMinutes: 1260,
              itemCount: 6,
              currentEndDate: '8034-03-06',
              delayDays: 0,
            },
          );
          assert.deepEqual(asked, [8034]);
        });

        await t.test('the kept holidays are used again, and a year ahead is read', async () => {
          asked.length = 0;
          await created(body('8034-03-01', '8034-03-01'));
          assert.deepEqual(asked, []);
          const { items } = await created(body('8034-12-31', '8035-01-02', 60, 180));
          assert.deepEqual(asked, [8035]);
          assert.deepEqual(
            items.map((item) => [item.date, item.targetMinutes]),
            [
              // A Sunday.
              ['8034-12-31', 180],
              ['8035-01-01', 180],
              ['8035-01-02', 60],
            ],
          );
        });

        await t.test(
          'a kind of day with no time has no items, though the schedule keeps it',
          async () => {
            const noWeekdays = await created(body('8034-03-01', '8034-03-06', 0, 300));
            assert.deepEqual(
              noWeekdays.items.map((item) => item.date),
              ['8034-03-01', '8034-03-04', '8034-03-05'],
            );
            assert.equal(noWeekdays.schedule.weekdayMinutes, 0);
            assert.equal(noWeekdays.schedule.totalMinutes, 900);
          },
        );

        await t.test('with no day that has time, nothing is created', async () => {
          const before = await rowsOf('schedules', 'start_date = $1', '8034-03-04');
          // Saturday and Sunday only, with nothing for those.
          const weekend = await create(body('8034-03-04', '8034-03-05', 120, 0));
          assert.equal(weekend.status, 400);
          assert.match(String(weekend.data.error), /목표 시간이 있는 날이 없습니다/);
          // A holiday is not a weekday: 8034-03-01 is a Wednesday.
          const holiday = await create(body('8034-03-01', '8034-03-01', 120, 0));
          assert.equal(holiday.status, 400);
          assert.equal(await rowsOf('schedules', 'start_date = $1', '8034-03-04'), before);
        });

        await t.test('the period may be 366 days and no more', async () => {
          const { schedule } = await created(body('8034-03-01', '8035-03-01', 60, 60));
          assert.equal(schedule.itemCount, 366);
          const longer = await create(body('8034-03-01', '8035-03-02', 60, 60));
          assert.equal(longer.status, 400);
        });

        await t.test('a day may hold 24 hours', async () => {
          const { items } = await created(body('8034-04-03', '8034-04-03', 1440, 1440));
          assert.equal(items[0].targetMinutes, 1440);
        });

        await t.test('the end may be next year, and later years are not asked for', async () => {
          await created(body('8035-12-30', '8035-12-31'));
          asked.length = 0;
          const later = await create(body('8035-12-31', '8036-01-01'));
          assert.equal(later.status, 400);
          assert.match(String(later.data.error), /내년 말까지/);
          assert.deepEqual(asked, []);
        });

        await t.test('holidays that cannot be read refuse with their own message', async () => {
          today = '8036-01-01';
          answer = async () => {
            throw new HolidayError('공휴일 정보를 읽지 못했습니다. 잠시 뒤 다시 시도하세요');
          };
          const failed = await create(body('8036-03-03', '8036-03-04'));
          assert.equal(failed.status, 503);
          assert.match(String(failed.data.error), /공휴일 정보를 읽지 못했습니다/);
          // A year not published yet.
          answer = async () => [];
          const empty = await create(body('8036-03-03', '8036-03-04'));
          assert.equal(empty.status, 503);
          assert.match(String(empty.data.error), /8036년 공휴일 정보가 없어/);
          assert.equal(await rowsOf('schedules', 'start_date = $1', '8036-03-03'), 0);
          // The second year missing refuses the whole schedule too.
          answer = async (year) =>
            year === 8037 ? [] : [{ date: `${year}-01-01`, name: '1월1일' }];
          const secondYear = await create(body('8036-12-31', '8037-01-02'));
          assert.equal(secondYear.status, 503);
          assert.equal(await rowsOf('schedules', 'start_date = $1', '8036-12-31'), 0);
          today = '8034-03-01';
        });

        await t.test('a schedule is listed and read, oldest start last', async () => {
          const list = (await call('/api/schedules')).data.schedules as Summary[];
          const mine = list.filter((row) => row.startDate.startsWith('803'));
          const key = (row: Summary) => [row.startDate, row.id];
          assert.deepEqual(
            mine.map(key),
            [...mine]
              .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id)
              .map(key),
          );
          assert.ok(new Set(mine.map((row) => row.startDate)).size < mine.length);
          const first = mine.find((row) => row.id === firstId);
          assert.equal(first?.totalMinutes, 1260);
          assert.equal(first?.itemCount, 6);

          const read = await call(`/api/schedules/${firstId}`);
          assert.equal(read.status, 200);
          const detail = read.data as unknown as Detail;
          assert.deepEqual(detail.schedule, first);
          assert.equal(detail.items.length, 6);
          assert.equal(detail.items[0].date, '8034-03-01');
        });

        await t.test('only the name changes; the period and the amounts stay', async () => {
          const updated = await call(`/api/schedules/${firstId}`, {
            method: 'PUT',
            body: { ...body('8034-05-01', '8034-05-02', 1, 1), title: ' 새 이름 ' },
          });
          assert.equal(updated.status, 200);
          const { schedule, items } = updated.data as unknown as Detail;
          assert.equal(schedule.title, '새 이름');
          assert.equal(schedule.startDate, '8034-03-01');
          assert.equal(schedule.weekdayMinutes, 120);
          assert.equal(schedule.totalMinutes, 1260);
          assert.equal(items.length, 6);
        });

        await t.test('deleting takes the items along, and a missing schedule is 404', async () => {
          const removed = await call(`/api/schedules/${firstId}`, { method: 'DELETE' });
          assert.equal(removed.status, 204);
          assert.equal(await rowsOf('schedule_items', 'schedule_id = $1', firstId), 0);
          for (const [method, requestBody] of [
            ['GET', undefined],
            ['PUT', { title: '이름' }],
            ['DELETE', undefined],
          ] as const) {
            const missing = await call(`/api/schedules/${firstId}`, { method, body: requestBody });
            assert.equal(missing.status, 404, method);
            assert.match(String(missing.data.error), /일정을 찾을 수 없습니다/);
          }
        });
      },
      { today: () => today, holidayFetcher },
    );

    // A pool of its own, whose connection fails on the items, shows the schedule does not stay alone.
    await t.test('a failure while saving the items leaves no schedule', async (sub) => {
      sub.mock.method(console, 'error', () => undefined);
      const failing = new Pool({ connectionString: url, max: 2 });
      sub.after(() => failing.end());
      failing.on('connect', (client) => {
        const query = client.query.bind(client) as (...args: unknown[]) => unknown;
        (client as unknown as { query: unknown }).query = (...args: unknown[]) =>
          String(args[0]).includes('INSERT INTO schedule_items')
            ? Promise.reject(new Error('items failed'))
            : query(...args);
      });
      answer = async (year) => [{ date: `${year}-03-01`, name: '삼일절' }];
      await withApi(
        failing,
        async (call) => {
          const { status } = await call('/api/schedules', {
            method: 'POST',
            body: body('8034-08-03', '8034-08-04'),
          });
          assert.equal(status, 500);
        },
        { today: () => '8034-03-01', holidayFetcher },
      );
      assert.equal(await rowsOf('schedules', 'start_date = $1', '8034-08-03'), 0);
    });
  },
);
