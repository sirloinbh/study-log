import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { dataPortalHolidays, dayKind, HolidayError } from '../src/holidays.js';

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
const page = (items: unknown, resultCode = '00') => ({
  response: {
    header: { resultCode, resultMsg: 'NORMAL SERVICE.' },
    body: { items, numOfRows: 50, pageNo: 1, totalCount: 1 },
  },
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
  const { fetchImpl } = portal({
    // One item comes as an object rather than a list.
    '01': page({ item: item(20260101, '1월1일') }),
    '03': page({
      item: [item(20260301, '삼일절'), item(20260302, '대체공휴일'), item('20260315', '평일', 'N')],
    }),
  });
  assert.deepEqual(await dataPortalHolidays(fetchImpl)(2026), [
    { date: '2026-01-01', name: '1월1일' },
    { date: '2026-03-01', name: '삼일절' },
    { date: '2026-03-02', name: '대체공휴일' },
  ]);
});

test('without a key it says which setting is missing, before any request', async () => {
  delete process.env[keyName];
  const { urls, fetchImpl } = portal({});
  await assert.rejects(dataPortalHolidays(fetchImpl)(2026), /HOLIDAY_API_KEY/);
  assert.equal(urls.length, 0);
});

test('anything unreadable fails the whole year without showing the key', async () => {
  // An error code, which the portal answers under status 200.
  await failsWithoutKey(portal({ '05': page('', '30') }).fetchImpl);
  // A shape that is not the documented one.
  await failsWithoutKey(portal({ '05': { wrong: true } }).fetchImpl);
  // A date of another year or none at all.
  await failsWithoutKey(portal({ '05': page({ item: item(20250505, '어린이날') }) }).fetchImpl);
  await failsWithoutKey(portal({ '05': page({ item: item(20260231, '없는 날') }) }).fetchImpl);
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
