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

test('invalid input is a Korean 400 before the DB or the holiday API', async () => {
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
    [['목록'], /JSON 객체/],
    [noTitle, /일정 이름을 입력하세요/],
    [{ ...fine, title: '   ' }, /일정 이름을 입력하세요/],
    [{ ...fine, title: '가'.repeat(201) }, /200자 이하/],
    [noStart, /시작일을 입력하세요/],
    [{ ...fine, startDate: '2026/11/02' }, /시작일은 YYYY-MM-DD/],
    [{ ...fine, endDate: '2026-11-31' }, /존재하지 않는 날짜/],
    [{ ...fine, endDate: '2026-11-01' }, /종료일은 시작일 이후/],
    [{ ...fine, startDate: '2026-11-01', endDate: '2027-11-03' }, /366일 이하/],
    [noWeekday, /평일 분량을 입력하세요/],
    [{ ...fine, weekdayMinutes: '60' }, /평일 분량 형식/],
    [{ ...fine, weekdayMinutes: 1.5 }, /분 단위 정수/],
    [{ ...fine, weekdayMinutes: -1 }, /0시간 이상/],
    [{ ...fine, restDayMinutes: 1441 }, /24시간 이하/],
    [{ ...fine, weekdayMinutes: 0, restDayMinutes: 0 }, /모두 0시간/],
    // Later than next year, though short.
    [{ ...fine, startDate: '2027-12-31', endDate: '2028-01-01' }, /내년 말까지/],
    // A start in the past: yesterday by the service date, with a valid end.
    [{ ...fine, startDate: '2026-10-31' }, /시작일은 오늘 이후/],
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
        [{ startDate: '2026-13-01', endDate: '2026-11-30' }, '존재하지 않는 날짜입니다'],
        [{ startDate: '2026-11-02', endDate: '2028-02-31' }, '존재하지 않는 날짜입니다'],
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
  const answers = [{ rowCount: 1 }, { rows: [] }];
  const pool = { query: async () => answers.shift() } as unknown as Pool;
  await withApi(pool, async (call) => {
    const { status, data } = await call('/api/schedules/1', {
      method: 'PUT',
      body: { title: '새 이름' },
    });
    assert.equal(status, 404);
    assert.match(String(data.error), /일정을 찾을 수 없습니다/);
  });
});
