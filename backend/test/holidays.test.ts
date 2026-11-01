import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { Pool } from 'pg';

import { dataPortalHolidays, dayKind, HolidayError, loadHolidays } from '../src/holidays.js';

const keyName = 'HOLIDAY_API_KEY';
const saved = process.env[keyName];
beforeEach(() => {
  process.env[keyName] = 'secret/key+value';
});
afterEach(() => {
  if (saved === undefined) delete process.env[keyName];
  else process.env[keyName] = saved;
});

const item = (locdate: number | string, dateName: string, isHoliday = 'Y') => ({
  dateKind: '01',
  dateName,
  isHoliday,
  locdate,
  seq: 1,
});
const page = (items: unknown, totalCount: number | string = 0, resultCode = '00') => ({
  response: {
    header: { resultCode, resultMsg: 'NORMAL SERVICE.' },
    body: { items, numOfRows: 50, pageNo: 1, totalCount },
  },
});
const one = (locdate: number | string, name: string, isHoliday = 'Y') =>
  page({ item: item(locdate, name, isHoliday) }, 1);

// A whole year with its fixed holidays. Months given in `changes` replace those answers.
const year2026 = (changes: Record<string, unknown> = {}) => ({
  '01': one(20260101, '1월1일'),
  '03': one(20260301, '삼일절'),
  '05': one(20260505, '어린이날'),
  '06': one(20260606, '현충일'),
  '08': one(20260815, '광복절'),
  '10': page({ item: [item(20261003, '개천절'), item(20261009, '한글날')] }, 2),
  '12': one(20261225, '기독탄신일'),
  ...changes,
});

// Answers per month ("03"); a month not listed has no holidays.
function portal(months: Record<string, unknown>) {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    const month = new URL(url).searchParams.get('solMonth') ?? '';
    return new Response(JSON.stringify(months[month] ?? page('')));
  }) as unknown as typeof fetch;
  return { urls, fetchImpl };
}

const failsWithoutKey = async (fetchImpl: typeof fetch) => {
  await assert.rejects(dataPortalHolidays(fetchImpl)(2026), (error: Error) => {
    assert.ok(error instanceof HolidayError);
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
};
const refused = (months: Record<string, unknown>) => failsWithoutKey(portal(months).fetchImpl);

test('a day is a weekday, a weekend or a holiday, a substitute holiday included', () => {
  // 2026-03-01 is a Sunday and a holiday; Monday 03-02 is its substitute.
  const holidays = new Set(['2026-03-01', '2026-03-02']);
  assert.equal(dayKind('2026-03-01', holidays), 'holiday');
  assert.equal(dayKind('2026-03-02', holidays), 'holiday');
  assert.equal(dayKind('2026-03-03', holidays), 'weekday');
  assert.equal(dayKind('2026-03-06', holidays), 'weekday');
  assert.equal(dayKind('2026-03-07', holidays), 'weekend');
  assert.equal(dayKind('2026-03-08', holidays), 'weekend');
});

test('every month of the year is read, in the documented form, with the key encoded', async () => {
  const { urls, fetchImpl } = portal({});
  // Nothing at all: a year not published yet.
  assert.deepEqual(await dataPortalHolidays(fetchImpl)(2026), []);
  assert.equal(urls.length, 12);
  const first = new URL(urls[0]);
  assert.equal(first.pathname.endsWith('/SpcdeInfoService/getRestDeInfo'), true);
  assert.equal(first.searchParams.get('solYear'), '2026');
  assert.equal(first.searchParams.get('solMonth'), '01');
  assert.equal(new URL(urls[11]).searchParams.get('solMonth'), '12');
  assert.equal(first.searchParams.get('_type'), 'json');
  assert.match(urls[0], /ServiceKey=secret%2Fkey%2Bvalue&/);
});

test('a key given already encoded is sent as it is', async () => {
  process.env[keyName] = 'secret%2Fkey';
  const { urls, fetchImpl } = portal({});
  await dataPortalHolidays(fetchImpl)(2026);
  assert.match(urls[0], /ServiceKey=secret%2Fkey&/);
});

test('one holiday, several, a string date, and days that are not days off', async () => {
  const { fetchImpl } = portal(
    year2026({
      '03': page(
        {
          item: [
            item(20260301, '삼일절'),
            item(20260302, '대체공휴일'),
            item('20260315', '평일', 'N'),
          ],
        },
        3,
      ),
    }),
  );
  const holidays = await dataPortalHolidays(fetchImpl)(2026);
  assert.deepEqual(holidays.slice(0, 3), [
    { date: '2026-01-01', name: '1월1일' },
    { date: '2026-03-01', name: '삼일절' },
    { date: '2026-03-02', name: '대체공휴일' },
  ]);
  assert.equal(holidays.length, 9);
  assert.equal(
    holidays.some((holiday) => holiday.name === '평일'),
    false,
  );
});

test('without a key it says which setting is missing, before any request', async () => {
  delete process.env[keyName];
  const { urls, fetchImpl } = portal({});
  await assert.rejects(dataPortalHolidays(fetchImpl)(2026), /HOLIDAY_API_KEY/);
  assert.equal(urls.length, 0);
});

test('anything unreadable fails the whole year without showing the key', async () => {
  // An error code, which the portal answers under status 200.
  await refused(year2026({ '05': page('', 0, '30') }));
  // A shape that is not the documented one.
  await refused(year2026({ '05': { wrong: true } }));
  // A date that does not exist.
  await refused(year2026({ '05': one(20260231, '없는 날') }));
  // A refused key is answered with XML.
  await failsWithoutKey(
    (async () =>
      new Response(
        '<OpenAPI_ServiceResponse>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</OpenAPI_ServiceResponse>',
      )) as unknown as typeof fetch,
  );
  await failsWithoutKey(
    (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch,
  );
  // A failed request can quote its URL with the key.
  await failsWithoutKey((async (url: string) => {
    throw new Error(`could not reach ${url}`);
  }) as unknown as typeof fetch);
});

// A broken answer must never read as "no holiday this month": the year would be kept without the
// holiday and trusted for seven days, and schedules made from it are never recalculated.
test('a broken answer never passes for a month without holidays', async () => {
  const header = { resultCode: '00', resultMsg: 'NORMAL SERVICE.' };
  const empty = (body: unknown) => ({ response: { header, body } });
  const broken: unknown[] = [
    { response: { header } },
    empty(null),
    empty({}),
    empty({ totalCount: 0 }),
    empty({ items: null, totalCount: 0 }),
    empty({ items: {}, totalCount: 0 }),
    // Without a count that can be compared.
    empty({ items: '' }),
    empty({ items: '', totalCount: null }),
    empty({ items: '', totalCount: '' }),
    empty({ items: '', totalCount: ' ' }),
    empty({ items: '', totalCount: false }),
    empty({ items: '', totalCount: [] }),
    // An empty list is not how an empty month is answered.
    empty({ items: { item: [] }, totalCount: 0 }),
    // The count says there are holidays the answer does not hold.
    page('', 3),
    page({ item: [] }, 1),
    page({ item: item(20260216, '설날') }, 2),
    // Neither Y nor N.
    one(20260216, '설날', 'y'),
    one(20260216, '설날', ''),
    // Another year, or another month: the request's month was not honoured.
    one(20250216, '설날'),
    one(20260101, '1월1일'),
  ];
  // The year itself is complete, so nothing but the reading of this month can refuse it.
  assert.equal((await dataPortalHolidays(portal(year2026()).fetchImpl)(2026)).length, 8);
  for (const answer of broken) await refused(year2026({ '02': answer }));
});

test('a count may come as digits, and a holiday in a month without fixed ones is kept', async () => {
  const { fetchImpl } = portal(year2026({ '02': page({ item: item(20260216, '설날') }, '1') }));
  const holidays = await dataPortalHolidays(fetchImpl)(2026);
  assert.deepEqual(
    holidays.find((holiday) => holiday.name === '설날'),
    { date: '2026-02-16', name: '설날' },
  );
});

test('a reading without a fixed holiday is not complete', async () => {
  await refused(year2026({ '05': page('') }));
  await refused(year2026({ '12': page('') }));
  // Marked as not a day off.
  await refused(year2026({ '08': one(20260815, '광복절', 'N') }));
});

test('years out of order are refused rather than meaning no holidays', async () => {
  const untouchedPool = {
    query: async () => {
      throw new Error('DB must not be queried');
    },
  } as unknown as Pool;
  const fetcher = async () => [];
  await assert.rejects(loadHolidays(untouchedPool, fetcher, 2027, 2026), RangeError);
  await assert.rejects(loadHolidays(untouchedPool, fetcher, 2026.5, 2027), RangeError);
});
