import { Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { datePlusDays, isCalendarDate } from './dates.js';
import { dayKind, HolidayError, type HolidayFetcher, loadHolidays } from './holidays.js';
import { inTransaction } from './sql.js';
import { bodyId } from './textbook-contents.js';
import { missingOrInvalid } from './validation.js';

// Study schedules (#34): /api/schedules. Rules in docs/decisions/schedule-rules.md.

// A year at most, so a schedule reads the holidays of two years at most: the request waits for them.
export const maxScheduleDays = 366;
const dayMs = 86_400_000;

// Both ends counted.
export const daysInPeriod = (start: string, end: string) =>
  (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / dayMs + 1;

export type DailyAmounts = { weekdayMinutes: number; restDayMinutes: number };
export type PlannedItem = { date: string; targetMinutes: number };

// One item for each day that has study time. A holiday and a weekend take the same amount.
// Counted in days rather than compared by date: datePlusDays stops at the last date it accepts.
export function plannedItems(
  start: string,
  end: string,
  holidays: ReadonlySet<string>,
  { weekdayMinutes, restDayMinutes }: DailyAmounts,
): PlannedItem[] {
  return Array.from({ length: daysInPeriod(start, end) }, (_, index) => {
    const date = datePlusDays(start, index);
    const kind = dayKind(date, holidays);
    return { date, targetMinutes: kind === 'weekday' ? weekdayMinutes : restDayMinutes };
  }).filter((item) => item.targetMinutes > 0);
}

// Which chapters each day holds, as indexes, for days with these targets (rule 2장). Chapter k of n
// ends on the first day whose running total reaches total × k ÷ n, compared in whole numbers. The
// next one starts that same day when the total went past the boundary, and on the next day when it
// landed exactly on it.
export function chapterDays(targets: number[], chapters: number): number[][] {
  const total = targets.reduce((sum, target) => sum + target, 0);
  let running = 0;
  let chapter = 0;
  return targets.map((target) => {
    running += target;
    const today: number[] = [];
    while (chapter < chapters) {
      today.push(chapter);
      const left = running * chapters - total * (chapter + 1);
      if (left < 0) break;
      chapter += 1;
      if (left === 0) break;
    }
    return today;
  });
}

// Same rule as the other ids: plain positive integers that stay exact in JS and fit bigint.
const idParam = z
  .string()
  .regex(/^[1-9]\d{0,14}$/, '일정 ID가 올바르지 않습니다')
  .transform(Number);

const title = z
  .string(missingOrInvalid('일정 이름을 입력하세요', '일정 이름 형식이 올바르지 않습니다'))
  .trim()
  .refine((value) => value.length >= 1, '일정 이름을 입력하세요')
  .refine((value) => value.length <= 200, '일정 이름 길이는 200자 이하여야 합니다');

const dateField = (label: string) =>
  z
    .string(missingOrInvalid(`${label}을 입력하세요`, `${label} 형식이 올바르지 않습니다`))
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label}은 YYYY-MM-DD 형식으로 입력하세요`)
    .refine(isCalendarDate, '존재하지 않는 날짜입니다');

const minutes = (label: string) =>
  z
    .number(
      missingOrInvalid(`${label} 분량을 입력하세요`, `${label} 분량 형식이 올바르지 않습니다`),
    )
    .int(`${label} 분량은 분 단위 정수로 입력하세요`)
    .min(0, `${label} 분량은 0시간 이상이어야 합니다`)
    .max(1440, `${label} 분량은 24시간 이하여야 합니다`);

const createInput = z
  .object(
    {
      title,
      startDate: dateField('시작일'),
      endDate: dateField('종료일'),
      weekdayMinutes: minutes('평일'),
      restDayMinutes: minutes('주말·공휴일'),
      // Without it the schedule holds only time. Without an end of the range, it runs to that end
      // of the book.
      chapters: z
        .object(
          {
            textbookId: bodyId('교재'),
            fromContentId: bodyId('첫 장').nullable().default(null),
            toContentId: bodyId('마지막 장').nullable().default(null),
          },
          { error: '장 범위를 JSON 객체로 보내세요' },
        )
        .optional(),
    },
    { error: '일정 내용을 JSON 객체로 보내세요' },
  )
  .superRefine((input, ctx) => {
    // Field errors do not stop this check, and a date that is wrong says so itself.
    if (!isCalendarDate(input.startDate) || !isCalendarDate(input.endDate)) return;
    if (input.endDate < input.startDate)
      ctx.addIssue({ code: 'custom', message: '종료일은 시작일 이후여야 합니다' });
    else if (daysInPeriod(input.startDate, input.endDate) > maxScheduleDays)
      ctx.addIssue({ code: 'custom', message: `일정 기간은 ${maxScheduleDays}일 이하여야 합니다` });
    // Refused here too, so no holidays are read for it.
    if (input.weekdayMinutes === 0 && input.restDayMinutes === 0)
      ctx.addIssue({ code: 'custom', message: '평일과 주말·공휴일 분량이 모두 0시간입니다' });
  });

// The period and the amounts stay: changing them would need the holidays again, and they are read
// only when creating (rule 3장, 5장).
const updateInput = z.object({ title }, { error: '일정 내용을 JSON 객체로 보내세요' });

const notFound = { error: '일정을 찾을 수 없습니다' };

const summaryColumns = `s.id, s.title, s.start_date AS "startDate", s.end_date AS "endDate",
  s.weekday_minutes AS "weekdayMinutes", s.rest_day_minutes AS "restDayMinutes",
  s.textbook_id AS "textbookId",
  (SELECT t.title FROM textbooks t WHERE t.id = s.textbook_id) AS "textbookTitle",
  COALESCE(sum(i.target_minutes), 0)::int AS "totalMinutes", count(i.id)::int AS "itemCount"`;

async function loadSchedule(db: Pool | PoolClient, id: number) {
  const { rows } = await db.query(
    `SELECT ${summaryColumns} FROM schedules s
     LEFT JOIN schedule_items i ON i.schedule_id = s.id
     WHERE s.id = $1 GROUP BY s.id`,
    [id],
  );
  if (!rows[0]) return undefined;
  const items = await db.query(
    `SELECT i.id, i.item_date AS date, i.target_minutes AS "targetMinutes",
       COALESCE(
         json_agg(json_build_object('id', c.id, 'number', c.number, 'title', c.title)
           ORDER BY sc.position) FILTER (WHERE c.id IS NOT NULL),
         '[]'
       ) AS contents
     FROM schedule_items i
     LEFT JOIN schedule_item_contents sc ON sc.schedule_item_id = i.id
     LEFT JOIN textbook_contents c ON c.id = sc.content_id
     WHERE i.schedule_id = $1 GROUP BY i.id ORDER BY i.item_date, i.id`,
    [id],
  );
  return { schedule: rows[0], items: items.rows };
}

type ChapterRange = {
  textbookId: number;
  fromContentId: number | null;
  toContentId: number | null;
};

// The chapters of the range in book order, or why there are none. A chapter is a top-level entry of
// the contents (rule 2장), so a section or another book's chapter is not found here.
async function chaptersInRange(
  db: Pool | PoolClient,
  { textbookId, fromContentId, toContentId }: ChapterRange,
): Promise<{ ids: number[] } | { error: string }> {
  const book = await db.query('SELECT 1 FROM textbooks WHERE id = $1', [textbookId]);
  if (!book.rowCount) return { error: '교재를 찾을 수 없습니다' };
  const { rows } = await db.query<{ id: number }>(
    `SELECT id FROM textbook_contents WHERE textbook_id = $1 AND parent_id IS NULL
     ORDER BY position`,
    [textbookId],
  );
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return { error: '목차에 장이 없어 장 단위 일정을 만들 수 없습니다' };
  const from = fromContentId === null ? 0 : ids.indexOf(fromContentId);
  const to = toContentId === null ? ids.length - 1 : ids.indexOf(toContentId);
  if (from < 0 || to < 0) return { error: '장을 찾을 수 없습니다' };
  if (from > to) return { error: '마지막 장은 첫 장 이후여야 합니다' };
  return { ids: ids.slice(from, to + 1) };
}

export function scheduleRoutes(pool: Pool, today: () => string, fetcher: HolidayFetcher) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT ${summaryColumns} FROM schedules s
       LEFT JOIN schedule_items i ON i.schedule_id = s.id
       GROUP BY s.id ORDER BY s.start_date DESC, s.id DESC`,
    );
    res.json({ schedules: rows });
  });

  router.get('/:id', async (req, res) => {
    const found = await loadSchedule(pool, idParam.parse(req.params.id));
    if (!found) return void res.status(404).json(notFound);
    res.json(found);
  });

  router.post('/', async (req, res) => {
    const input = createInput.parse(req.body);
    // An item already overdue would be moved as soon as the schedule is read (rule 4장).
    const date = today();
    if (input.startDate < date)
      return void res.status(400).json({ error: '시작일은 오늘 이후여야 합니다' });
    // Years further on are not published: asking for them would only spend the API's daily calls,
    // again on every request, since an empty year is not kept (rule 3장, 5장).
    if (Number(input.endDate.slice(0, 4)) > Number(date.slice(0, 4)) + 1)
      return void res.status(400).json({ error: '종료일은 내년 말까지 정할 수 있습니다' });
    // Before the holidays, so a range that cannot work calls no API. Checked again below, under lock.
    if (input.chapters) {
      const chosen = await chaptersInRange(pool, input.chapters);
      if ('error' in chosen) return void res.status(400).json({ error: chosen.error });
    }
    let holidays: Set<string>;
    try {
      // Before the transaction: this may call the API (rule 3장).
      holidays = await loadHolidays(
        pool,
        fetcher,
        Number(input.startDate.slice(0, 4)),
        Number(input.endDate.slice(0, 4)),
      );
    } catch (error) {
      // The global handler would answer this with a general 500.
      if (!(error instanceof HolidayError)) throw error;
      return void res.status(error.status).json({ error: error.message });
    }
    const items = plannedItems(input.startDate, input.endDate, holidays, input);
    if (items.length === 0)
      return void res.status(400).json({ error: '이 기간에는 목표 시간이 있는 날이 없습니다' });
    const reply = await inTransaction(pool, async (client) => {
      let chapterIds: number[] = [];
      if (input.chapters) {
        // Adding, deleting and reordering chapters take this row's lock (textbook-contents.ts).
        await client.query('SELECT 1 FROM textbooks WHERE id = $1 FOR SHARE', [
          input.chapters.textbookId,
        ]);
        const chosen = await chaptersInRange(client, input.chapters);
        if ('error' in chosen) return { status: 400, body: { error: chosen.error } };
        chapterIds = chosen.ids;
      }
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO schedules
           (title, start_date, end_date, weekday_minutes, rest_day_minutes, textbook_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          input.title,
          input.startDate,
          input.endDate,
          input.weekdayMinutes,
          input.restDayMinutes,
          input.chapters?.textbookId ?? null,
        ],
      );
      const saved = await client.query<{ id: number; date: string }>(
        `INSERT INTO schedule_items (schedule_id, item_date, target_minutes)
         SELECT $1, * FROM unnest($2::date[], $3::int[])
         RETURNING id, to_char(item_date, 'YYYY-MM-DD') AS date`,
        [rows[0].id, items.map((item) => item.date), items.map((item) => item.targetMinutes)],
      );
      if (input.chapters) {
        const idOfDate = new Map(saved.rows.map((row) => [row.date, row.id]));
        const days = chapterDays(
          items.map((item) => item.targetMinutes),
          chapterIds.length,
        );
        const pairs = days.flatMap((chapters, day) =>
          chapters.map((chapter) => [idOfDate.get(items[day].date), chapterIds[chapter], chapter]),
        );
        await client.query(
          `INSERT INTO schedule_item_contents (schedule_item_id, textbook_id, content_id, position)
           SELECT item, $1, content, position
           FROM unnest($2::bigint[], $3::bigint[], $4::int[]) AS p(item, content, position)`,
          [
            input.chapters.textbookId,
            pairs.map((pair) => pair[0]),
            pairs.map((pair) => pair[1]),
            pairs.map((pair) => pair[2]),
          ],
        );
      }
      return { status: 201, body: await loadSchedule(client, rows[0].id) };
    });
    res.status(reply.status).json(reply.body);
  });

  router.put('/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = updateInput.parse(req.body);
    const { rowCount } = await pool.query(
      'UPDATE schedules SET title = $2, updated_at = now() WHERE id = $1',
      [id, input.title],
    );
    if (!rowCount) return void res.status(404).json(notFound);
    // Deleted right after the update, by another tab.
    const found = await loadSchedule(pool, id);
    if (!found) return void res.status(404).json(notFound);
    res.json(found);
  });

  // Its items go with it.
  router.delete('/:id', async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM schedules WHERE id = $1', [
      idParam.parse(req.params.id),
    ]);
    if (!rowCount) return void res.status(404).json(notFound);
    res.status(204).end();
  });

  return router;
}
