import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { isCalendarDate } from './dates.js';
import { inTransaction } from './sql.js';

// Public holidays for schedules (#33, docs/decisions/schedule-rules.md 3장). The loader takes a
// `HolidayFetcher`, so tests hand in a stand-in and never call the API.
export type Holiday = { date: string; name: string };
export type HolidayFetcher = (year: number) => Promise<Holiday[]>;
export type DayKind = 'weekday' | 'weekend' | 'holiday';

// Holidays that could not be read. The message is shown to the person and may be logged, so it
// never holds the API key (the request URL does).
export class HolidayError extends Error {
  readonly status = 503;
}

// A holiday on a weekend is still a holiday: both count the same for schedules, and the kind says
// why. A substitute holiday comes from the API as a holiday of its own date.
export function dayKind(date: string, holidays: ReadonlySet<string>): DayKind {
  if (holidays.has(date)) return 'holiday';
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6 ? 'weekend' : 'weekday';
}

const endpoint = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';
const requestTimeout = 10_000;
const unreadable = '공휴일 정보를 읽지 못했습니다. 잠시 뒤 다시 시도하세요';

const item = z.object({
  locdate: z.union([z.number(), z.string()]),
  dateName: z.string(),
  isHoliday: z.string(),
});
// `items` is an empty string for a month without holidays, and `item` a lone object when there is
// only one.
const answer = z.object({
  response: z.object({
    header: z.object({ resultCode: z.string() }),
    body: z
      .object({
        items: z.union([z.literal(''), z.object({ item: z.union([item, z.array(item)]) })]),
      })
      .optional(),
  }),
});

function monthHolidays(body: unknown, year: number): Holiday[] {
  const parsed = answer.safeParse(body);
  if (!parsed.success || parsed.data.response.header.resultCode !== '00')
    throw new HolidayError(unreadable);
  const items = parsed.data.response.body?.items;
  if (!items) return [];
  return [items.item]
    .flat()
    .filter((entry) => entry.isHoliday === 'Y')
    .map((entry) => {
      const digits = String(entry.locdate);
      const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
      if (digits.length !== 8 || !isCalendarDate(date) || !date.startsWith(`${year}-`))
        throw new HolidayError(unreadable);
      return { date, name: entry.dateName };
    });
}

// The astronomy institute's holiday API on the data portal. Its documented request needs a month,
// so a year is twelve requests, one at a time; one failed month fails the year rather than leaving
// holidays out. The key is read on use, so the server starts without one.
export function dataPortalHolidays(fetchImpl: typeof fetch = fetch): HolidayFetcher {
  return async (year) => {
    const key = process.env.HOLIDAY_API_KEY;
    if (!key) throw new HolidayError('공휴일 API 키(HOLIDAY_API_KEY)가 서버에 설정되지 않았습니다');
    // The portal issues the key in plain and in already encoded form; either may be configured.
    const serviceKey = key.includes('%') ? key : encodeURIComponent(key);
    const holidays: Holiday[] = [];
    for (let month = 1; month <= 12; month++) {
      const query = `solYear=${year}&solMonth=${String(month).padStart(2, '0')}&numOfRows=50&_type=json`;
      let body: unknown;
      try {
        const response = await fetchImpl(`${endpoint}?ServiceKey=${serviceKey}&${query}`, {
          signal: AbortSignal.timeout(requestTimeout),
        });
        if (!response.ok) throw new Error('status');
        // A refused key is answered with XML under status 200, which fails here too.
        body = await response.json();
      } catch {
        // Not passed on: the failure of a request can quote its URL, and so the key.
        throw new HolidayError(unreadable);
      }
      holidays.push(...monthHolidays(body, year));
    }
    return holidays;
  };
}

const maxAgeMs = 7 * 24 * 60 * 60 * 1000;

// The holiday dates of the years from `from` to `to`, for creating a schedule. Call it outside a
// transaction, since it may call the API (rule 3장). A year is read again once its copy is seven
// days old. An empty answer means a year not published yet and is not kept. A year that cannot be
// read uses the copy there is, and without one this refuses: counting a holiday as a weekday would
// make a wrong schedule.
export async function loadHolidays(
  pool: Pool,
  fetcher: HolidayFetcher,
  from: number,
  to: number,
  now = new Date(),
): Promise<Set<string>> {
  const years = Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const { rows } = await pool.query<{ year: number; fetchedAt: Date }>(
    'SELECT year, fetched_at AS "fetchedAt" FROM holiday_years WHERE year = ANY($1::int[])',
    [years],
  );
  const stored = new Map(rows.map((row) => [row.year, row.fetchedAt.getTime()]));
  for (const year of years) {
    const fetchedAt = stored.get(year);
    if (fetchedAt !== undefined && now.getTime() - fetchedAt < maxAgeMs) continue;
    let fresh: Holiday[] = [];
    let failure: unknown;
    try {
      fresh = await fetcher(year);
    } catch (error) {
      failure = error;
    }
    if (fresh.length) {
      await saveYear(pool, year, fresh, now);
    } else if (fetchedAt === undefined) {
      if (failure instanceof HolidayError) throw failure;
      throw new HolidayError(`${year}년 공휴일 정보가 없어 일정을 만들 수 없습니다`);
    } else {
      console.error(
        JSON.stringify({
          event: 'holiday_refresh_failed',
          year,
          message: failure instanceof HolidayError ? failure.message : 'no holidays returned',
        }),
      );
    }
  }
  const dates = await pool.query<{ date: string }>(
    // As text: without app.ts's date parser, a date would come back shifted by the time zone.
    `SELECT DISTINCT to_char(holiday_date, 'YYYY-MM-DD') AS date FROM holidays
     WHERE holiday_date BETWEEN $1 AND $2`,
    [`${String(from).padStart(4, '0')}-01-01`, `${String(to).padStart(4, '0')}-12-31`],
  );
  return new Set(dates.rows.map((row) => row.date));
}

// Replaces the year's copy. Taking the year's row first keeps two refreshes from mixing.
async function saveYear(pool: Pool, year: number, holidays: Holiday[], now: Date) {
  const padded = String(year).padStart(4, '0');
  await inTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO holiday_years (year, fetched_at) VALUES ($1, $2)
       ON CONFLICT (year) DO UPDATE SET fetched_at = EXCLUDED.fetched_at`,
      [year, now],
    );
    await client.query('DELETE FROM holidays WHERE holiday_date BETWEEN $1 AND $2', [
      `${padded}-01-01`,
      `${padded}-12-31`,
    ]);
    await client.query(
      `INSERT INTO holidays (holiday_date, name)
       SELECT * FROM unnest($1::date[], $2::text[]) ON CONFLICT DO NOTHING`,
      [holidays.map((holiday) => holiday.date), holidays.map((holiday) => holiday.name)],
    );
  });
}
