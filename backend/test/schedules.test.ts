import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { daysInPeriod, plannedItems } from '../src/schedules.js';
import { withApi } from './helpers.js';

const amounts = { weekdayMinutes: 120, restDayMinutes: 300 };

// 2026-03-01 is a Sunday and a holiday, Monday 03-02 its substitute; 03-07 is a Saturday.
const holidays = new Set(['2026-03-01', '2026-03-02']);

test('both ends of a period count, across a month and a leap day', () => {
  assert.equal(daysInPeriod('2026-03-01', '2026-03-01'), 1);
  assert.equal(daysInPeriod('2026-02-28', '2026-03-01'), 2);
  assert.equal(daysInPeriod('2028-02-28', '2028-03-01'), 3);
  assert.equal(daysInPeriod('2026-01-01', '2026-12-31'), 365);
});

test('a weekday, a weekend and a holiday each take their amount', () => {
  assert.deepEqual(plannedItems('2026-02-27', '2026-03-03', holidays, amounts), [
    { date: '2026-02-27', targetMinutes: 120 }, // Friday
    { date: '2026-02-28', targetMinutes: 300 }, // Saturday
    { date: '2026-03-01', targetMinutes: 300 }, // holiday on a Sunday
    { date: '2026-03-02', targetMinutes: 300 }, // substitute holiday on a Monday
    { date: '2026-03-03', targetMinutes: 120 }, // Tuesday
  ]);
});

test('a kind of day with no study time has no items', () => {
  const dates = (weekdayMinutes: number, restDayMinutes: number) =>
    plannedItems('2026-03-01', '2026-03-07', holidays, { weekdayMinutes, restDayMinutes }).map(
      (item) => item.date,
    );
  assert.deepEqual(dates(0, 300), ['2026-03-01', '2026-03-02', '2026-03-07']);
  assert.deepEqual(dates(120, 0), ['2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']);
  assert.deepEqual(dates(0, 0), []);
});

test('the last date the API accepts ends the items instead of repeating', () => {
  const items = plannedItems('9999-12-30', '9999-12-31', new Set(), amounts);
  assert.deepEqual(
    items.map((item) => item.date),
    ['9999-12-30', '9999-12-31'],
  );
});

const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;

test('invalid input is an English 400 before the DB or the holiday API', async () => {
  const fine = {
    title: '알고리즘',
    startDate: '2026-11-02',
    endDate: '2026-11-30',
    ...amounts,
  };
  const { title: _title, ...noTitle } = fine;
  const { startDate: _start, ...noStart } = fine;
  const { weekdayMinutes: _weekday, ...noWeekday } = fine;
  const cases: [unknown, RegExp][] = [
    [['목록'], /JSON object/],
    [noTitle, /Enter the schedule name/],
    [{ ...fine, title: '   ' }, /Enter the schedule name/],
    [{ ...fine, title: '가'.repeat(201) }, /at most 200 characters/],
    [noStart, /Enter the start date/],
    [{ ...fine, startDate: '2026/11/02' }, /start date must be in YYYY-MM-DD/],
    [{ ...fine, endDate: '2026-11-31' }, /This date does not exist/],
    [{ ...fine, endDate: '2026-11-01' }, /end date must be after the start date/],
    [{ ...fine, startDate: '2026-11-01', endDate: '2027-11-03' }, /at most 366 days/],
    [noWeekday, /Enter the weekday amount/],
    [{ ...fine, weekdayMinutes: '60' }, /weekday amount format/],
    [{ ...fine, weekdayMinutes: 1.5 }, /whole number of minutes/],
    [{ ...fine, weekdayMinutes: -1 }, /at least 0 minutes/],
    [{ ...fine, restDayMinutes: 1441 }, /at most 24 hours/],
    [{ ...fine, weekdayMinutes: 0, restDayMinutes: 0 }, /both 0/],
    // Later than next year, though short.
    [{ ...fine, startDate: '2027-12-31', endDate: '2028-01-01' }, /end of next year/],
    // A start in the past: yesterday by the service date, with a valid end.
    [{ ...fine, startDate: '2026-10-31' }, /start date must be today or later/],
  ];
  await withApi(
    untouchedPool,
    async (call) => {
      for (const [body, message] of cases) {
        const { status, data } = await call('/api/schedules', { method: 'POST', body });
        assert.equal(status, 400, JSON.stringify(body));
        assert.match(String(data.error), message);
      }
      // A wrong date does not bring a false complaint about the other date or the period.
      for (const [dates, message] of [
        [{ startDate: '2026-13-01', endDate: '2026-11-30' }, 'This date does not exist'],
        [{ startDate: '2026-11-02', endDate: '2028-02-31' }, 'This date does not exist'],
      ] as const) {
        const { data } = await call('/api/schedules', {
          method: 'POST',
          body: { ...fine, ...dates },
        });
        assert.equal(data.error, message);
      }
      for (const [method, path, body] of [
        ['GET', '/api/schedules/abc', undefined],
        ['PUT', '/api/schedules/0', { title: '이름' }],
        ['DELETE', '/api/schedules/1e3', undefined],
        ['PUT', '/api/schedules/1', { title: ' ' }],
      ] as const) {
        const { status } = await call(path, { method, body });
        assert.equal(status, 400, path);
      }
    },
    {
      today: () => '2026-11-01',
      holidayFetcher: async () => {
        throw new Error('invalid input must not read holidays');
      },
    },
  );
});

test('a schedule deleted right after its rename is 404, not an empty 200', async () => {
  // The rename, looking for days behind, and reading it back.
  const answers = [{ rowCount: 1 }, { rows: [] }, { rows: [] }];
  const pool = { query: async () => answers.shift() } as unknown as Pool;
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/schedules/1', {
      method: 'PUT',
      body: { title: '새 이름' },
    });
    assert.equal(status, 404);
    assert.match(String(data.error), /Schedule not found/);
  });
});

// #270: reading never writes; the catch-up runs once a service day, after the first schedule response.
const statementsOf = (calls: string[]) =>
  calls.map((sql) => sql.trim().split(/\s+/).slice(0, 2).join(' ').toUpperCase());
const catchUpPool = (calls: string[], failures: { left: number }) =>
  ({
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes('SELECT DISTINCT schedule_id')) {
        if (failures.left-- > 0) throw new Error('database is down');
        return { rows: [{ id: 7 }] };
      }
      return { rows: [], rowCount: 0 };
    },
  }) as unknown as Pool;
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

test('GET /api/schedules issues no writes, and the catch-up runs after the response, once a day', async () => {
  const calls: string[] = [];
  let day = '2026-11-01';
  await withApi(
    catchUpPool(calls, { left: 0 }),
    async (call) => {
      assert.equal((await call('/api/schedules')).status, 200);
      await settle();
      // The list itself only read: the first write comes after its query.
      const list = calls.findIndex((sql) => /FROM schedules s\b/.test(sql));
      const firstWrite = calls.findIndex((sql) => /^\s*(UPDATE|INSERT|DELETE)/i.test(sql));
      assert.ok(list >= 0 && firstWrite > list, calls.map((sql) => sql.slice(0, 40)).join('\n'));
      assert.ok(calls.some((sql) => /UPDATE schedule_items/.test(sql)));
      const updates = () => calls.filter((sql) => /UPDATE schedule_items/.test(sql)).length;
      assert.equal(updates(), 1);

      // The same day again: no second catch-up.
      await call('/api/schedules');
      await settle();
      assert.equal(updates(), 1);

      // The next day: once more.
      day = '2026-11-02';
      await call('/api/schedules');
      await settle();
      assert.equal(updates(), 2);
      assert.deepEqual(
        statementsOf(calls).filter((sql) => sql === 'UPDATE SCHEDULE_ITEMS'),
        ['UPDATE SCHEDULE_ITEMS', 'UPDATE SCHEDULE_ITEMS'],
      );
    },
    { today: () => day },
  );
});

test('a failed catch-up does not fail the request and is tried again on the next one', async () => {
  const calls: string[] = [];
  const original = console.error;
  const logged: string[] = [];
  console.error = (line: string) => void logged.push(line);
  try {
    await withApi(
      catchUpPool(calls, { left: 1 }),
      async (call) => {
        assert.equal((await call('/api/schedules')).status, 200);
        await settle();
        assert.equal(calls.filter((sql) => /UPDATE schedule_items/.test(sql)).length, 0);
        assert.match(logged.join('\n'), /schedule_catch_up_failed/);
        assert.equal((await call('/api/schedules')).status, 200);
        await settle();
        assert.equal(calls.filter((sql) => /UPDATE schedule_items/.test(sql)).length, 1);
      },
      { today: () => '2026-11-01' },
    );
  } finally {
    console.error = original;
  }
});
