import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { type Holiday, HolidayError, loadHolidays } from '../src/holidays.js';

const url = process.env.TEST_DATABASE_URL;

// #33. Requires a dedicated test DB with database/migrations applied. Years 2190 to 2193 belong to
// this test alone.
test('holidays are kept per year and read again as the rules say', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const cleanup = async () => {
    await pool.query('DELETE FROM holiday_years WHERE year BETWEEN 2190 AND 2193');
    await pool.query(
      "DELETE FROM holidays WHERE holiday_date BETWEEN '2190-01-01' AND '2193-12-31'",
    );
  };
  t.after(async () => {
    await cleanup();
    await pool.end();
  });
  await cleanup();
  const errors = t.mock.method(console, 'error', () => undefined);

  const asked: number[] = [];
  let answer: (year: number) => Holiday[] = (year) => [{ date: `${year}-03-01`, name: '삼일절' }];
  const fetcher = async (year: number) => {
    asked.push(year);
    return answer(year);
  };
  const day = 86_400_000;
  const start = new Date('2190-06-01T00:00:00Z');
  const later = (days: number) => new Date(start.getTime() + days * day);
  const load = (from: number, to: number, now = start) =>
    loadHolidays(pool, fetcher, from, to, now);

  await t.test('a new year is read and kept, and every year of a range counts', async () => {
    assert.deepEqual([...(await load(2190, 2191))].sort(), ['2190-03-01', '2191-03-01']);
    assert.deepEqual(asked, [2190, 2191]);
  });

  await t.test('within seven days the kept copy is used', async () => {
    asked.length = 0;
    assert.deepEqual([...(await load(2190, 2190, later(6)))], ['2190-03-01']);
    assert.deepEqual(asked, []);
  });

  await t.test('after seven days the year is read again and replaced', async () => {
    answer = (year) => [
      // Two holidays on one date, and a substitute holiday added since the last reading.
      { date: `${year}-05-05`, name: '어린이날' },
      { date: `${year}-05-05`, name: '부처님오신날' },
      { date: `${year}-05-06`, name: '대체공휴일' },
    ];
    assert.deepEqual([...(await load(2190, 2190, later(7)))].sort(), ['2190-05-05', '2190-05-06']);
    assert.deepEqual(asked, [2190]);
    const names = await pool.query(
      "SELECT name FROM holidays WHERE holiday_date = '2190-05-05' ORDER BY name",
    );
    assert.equal(names.rows.length, 2);
    // Fresh again from that reading.
    asked.length = 0;
    await load(2190, 2190, later(13));
    assert.deepEqual(asked, []);
  });

  await t.test('a failed or empty reading keeps the copy there is', async () => {
    answer = () => {
      throw new HolidayError('공휴일 정보를 읽지 못했습니다');
    };
    assert.deepEqual([...(await load(2190, 2190, later(30)))].sort(), ['2190-05-05', '2190-05-06']);
    answer = () => [];
    assert.deepEqual([...(await load(2190, 2190, later(30)))].sort(), ['2190-05-05', '2190-05-06']);
    const kept = await pool.query('SELECT 1 FROM holidays WHERE holiday_date = $1', ['2190-05-06']);
    assert.equal(kept.rows.length, 1);
    assert.equal(errors.mock.callCount(), 2);
    assert.match(String(errors.mock.calls[0].arguments[0]), /holiday_refresh_failed/);
    // An unexpected failure is not reported as an empty answer.
    answer = () => {
      throw new Error('secret in a message');
    };
    await load(2190, 2190, later(30));
    const logged = String(errors.mock.calls[2].arguments[0]);
    assert.match(logged, /unexpected failure/);
    assert.doesNotMatch(logged, /secret/);
    // Still stale, so the next schedule tries again.
    asked.length = 0;
    await load(2190, 2190, later(31));
    assert.deepEqual(asked, [2190]);
  });

  await t.test('without any copy it refuses, and an empty year is not kept', async () => {
    answer = () => [];
    await assert.rejects(load(2192, 2192), (error: Error) => {
      assert.ok(error instanceof HolidayError);
      assert.match(error.message, /2192년 공휴일 정보가 없어 일정을 만들 수 없습니다/);
      return true;
    });
    const none = await pool.query('SELECT 1 FROM holiday_years WHERE year = 2192');
    assert.equal(none.rows.length, 0);
    // Not published then, read again on the next try.
    answer = (year) => [{ date: `${year}-01-01`, name: '1월1일' }];
    assert.deepEqual([...(await load(2192, 2192))], ['2192-01-01']);
  });

  await t.test('the reason for a refusal is passed on; any other failure is not', async () => {
    answer = () => {
      throw new HolidayError('공휴일 API 키(HOLIDAY_API_KEY)가 서버에 설정되지 않았습니다');
    };
    await assert.rejects(load(2193, 2193), /HOLIDAY_API_KEY/);
    answer = () => {
      throw new Error('secret in a message');
    };
    await assert.rejects(load(2193, 2193), (error: Error) => {
      assert.ok(error instanceof HolidayError);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    });
  });
});
