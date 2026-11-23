import type { Response } from 'express';
import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { calendarDate } from './dates.js';

const exportDate = calendarDate(
  z.string({ error: 'The date format is invalid' }),
  'The date must be in YYYY-MM-DD format',
);

// Optional date range; each end is included.
export const exportQuery = z
  .object({ from: exportDate.optional(), to: exportDate.optional() })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    error: 'The start date cannot be after the end date',
  });

// One CSV cell. A cell with a comma, quote or line break is quoted, quotes doubled. A cell a
// spreadsheet would read as a formula (starting with = + @, or - not followed by a space) gets a
// leading apostrophe, so opening an export cannot run anything. Dashes before a space stay: memos
// start list items that way.
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^([=+@\t\r]|-(?! ))/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const bom = String.fromCharCode(0xfeff);

// A UTF-8 byte order mark first, so Excel reads Korean text right; rows end with CRLF (RFC 4180).
export const toCsv = (header: string[], rows: unknown[][]) =>
  `${bom}${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;

const download = (res: Response, type: string, name: string, body: string) =>
  void res
    .set({
      'content-type': `${type}; charset=utf-8`,
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    })
    .send(body);

type Exercise = {
  textbook: string;
  chapter: string;
  number: string;
  body: string;
  important: boolean;
  answer: string | null;
};

// Exercises with their answers as Markdown: a heading per textbook and chapter, then each problem.
// The texts are the user's own and go in as they are.
export function exercisesMarkdown(rows: Exercise[]) {
  const out = ['# Exercises', ''];
  let textbook: string | undefined;
  let chapter: string | undefined;
  for (const row of rows) {
    if (row.textbook !== textbook) {
      textbook = row.textbook;
      chapter = undefined;
      out.push(`## ${row.textbook}`, '');
    }
    if (row.chapter !== chapter) {
      chapter = row.chapter;
      out.push(`### ${row.chapter}`, '');
    }
    out.push(
      `#### Problem ${row.number || '(no number)'}${row.important ? ' (important)' : ''}`,
      '',
    );
    out.push(row.body, '');
    if (row.answer !== null) out.push('**Answer**', '', row.answer, '');
  }
  return out.join('\n');
}

type Retrospective = { kind: string; from: string; to: string; body: string };

export function retrospectivesMarkdown(rows: Retrospective[]) {
  const out = ['# Retrospectives', ''];
  for (const row of rows) {
    out.push(`## ${row.kind === 'weekly' ? 'Weekly' : 'Monthly'} ${row.from} to ${row.to}`, '');
    out.push(row.body, '');
  }
  return out.join('\n');
}

const studyLogColumns = [
  'id',
  'date',
  'start',
  'end',
  'minutes',
  'status',
  'type',
  'textbook',
  'chapter_number',
  'chapter',
  'understanding',
  'goal_achieved',
  'difficulties',
  'memo',
];

export function exportRoutes(pool: Pool, today: () => string) {
  const router = Router();
  // `column` is compared with the range ends; they are left out when not given.
  const range = (column: string, query: unknown) => {
    const { from, to } = exportQuery.parse(query);
    const params: string[] = [];
    const where: string[] = [];
    if (from) where.push(`${column} >= $${params.push(from)}`);
    if (to) where.push(`${column} <= $${params.push(to)}`);
    return { filter: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  };

  router.get('/study-logs.csv', async (req, res) => {
    const { filter, params } = range('l.study_date', req.query);
    const { rows } = await pool.query(
      `SELECT l.id, l.study_date AS date, to_char(l.start_time, 'HH24:MI') AS start,
         to_char(l.end_time, 'HH24:MI') AS "end", l.duration_minutes AS minutes, l.status,
         l.study_type AS type, t.title AS textbook, c.number AS chapter_number, c.title AS chapter,
         l.understanding, l.goal_achieved, l.difficulties, l.memo
       FROM study_logs l
       LEFT JOIN textbooks t ON t.id = l.textbook_id
       LEFT JOIN textbook_contents c ON c.id = l.content_id
       ${filter} ORDER BY l.study_date, l.start_time, l.id`,
      params,
    );
    const body = toCsv(
      studyLogColumns,
      rows.map((row) => studyLogColumns.map((name) => row[name])),
    );
    download(res, 'text/csv', `study-logs-${today()}.csv`, body);
  });

  router.get('/exercises.md', async (req, res) => {
    const { filter, params } = range(`(e.created_at AT TIME ZONE 'Asia/Seoul')::date`, req.query);
    const { rows } = await pool.query<Exercise>(
      `SELECT t.title AS textbook, trim(c.number || ' ' || c.title) AS chapter, e.number,
         e.body, e.important, a.body AS answer
       FROM exercises e
       JOIN textbooks t ON t.id = e.textbook_id
       JOIN textbook_contents c ON c.id = e.content_id
       LEFT JOIN exercise_answers a ON a.exercise_id = e.id
       ${filter} ORDER BY t.id, c.id, e.id`,
      params,
    );
    download(res, 'text/markdown', `exercises-${today()}.md`, exercisesMarkdown(rows));
  });

  router.get('/retrospectives.md', async (req, res) => {
    const { filter, params } = range('period_start', req.query);
    const { rows } = await pool.query<Retrospective>(
      `SELECT kind, period_start AS "from", period_end AS "to", body FROM retrospectives
       ${filter} ORDER BY period_start, kind`,
      params,
    );
    download(res, 'text/markdown', `retrospectives-${today()}.md`, retrospectivesMarkdown(rows));
  });

  return router;
}
