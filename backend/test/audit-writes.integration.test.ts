import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type Call = Parameters<Parameters<typeof withApi>[1]>[0];

// #263. Requires a dedicated test DB with database/migrations applied. Year 8053 belongs to this
// test alone. Every change sends its own X-Request-Id, so its audit rows are found by that ID.
test('each change through the API leaves one audit row', { skip: !url }, async (t) => {
  const pool = new Pool({ connectionString: url });
  const run = `audit263-${process.pid}-${Date.now()}`;
  const books: number[] = [];
  const cleanup = async () => {
    await pool.query(
      "DELETE FROM study_logs WHERE study_date BETWEEN '8053-01-01' AND '8053-12-31'",
    );
    await pool.query(
      "DELETE FROM retrospectives WHERE period_start BETWEEN '8053-01-01' AND '8053-12-31'",
    );
    await pool.query(
      "DELETE FROM schedules WHERE start_date BETWEEN '8053-01-01' AND '8053-12-31'",
    );
    if (books.length) await pool.query('DELETE FROM textbooks WHERE id = ANY($1)', [books]);
    await pool.query('DELETE FROM audit_log WHERE request_id LIKE $1', [`${run}%`]);
  };
  await cleanup();
  t.after(async () => {
    await cleanup();
    await pool.end();
  });

  await withApi(
    pool,
    async (call: Call) => {
      let counter = 0;
      // Sends one change and checks that exactly one audit row carries its request ID.
      const change = async (
        entity: string,
        action: 'create' | 'update' | 'delete',
        path: string,
        init: { method: string; body?: unknown },
        status: number,
      ) => {
        const requestId = `${run}-${++counter}`;
        const reply = await call(path, { ...init, headers: { 'x-request-id': requestId } });
        assert.equal(reply.status, status, `${init.method} ${path}: ${JSON.stringify(reply.data)}`);
        const { rows } = await pool.query<{ entity: string; action: string; result: string }>(
          'SELECT entity, action, result FROM audit_log WHERE request_id = $1',
          [requestId],
        );
        assert.deepEqual(
          rows,
          [{ entity, action, result: 'ok' }],
          `${init.method} ${path} wrote the wrong audit rows`,
        );
        return reply.data;
      };
      const idOf = (data: Record<string, unknown>, key: string) => (data[key] as { id: number }).id;

      await t.test('textbooks and their contents', async () => {
        const made = await change(
          'textbook',
          'create',
          '/api/textbooks',
          {
            method: 'POST',
            body: { title: '감사 기록 책' },
          },
          201,
        );
        const book = idOf(made, 'textbook');
        books.push(book);
        await change(
          'textbook',
          'update',
          `/api/textbooks/${book}`,
          {
            method: 'PUT',
            body: { title: '감사 기록 책 2' },
          },
          200,
        );
        const content = idOf(
          await change(
            'textbook_content',
            'create',
            `/api/textbooks/${book}/contents`,
            {
              method: 'POST',
              body: { number: '1', title: '1장' },
            },
            201,
          ),
          'content',
        );
        await change(
          'textbook_content',
          'update',
          `/api/textbooks/${book}/contents/${content}`,
          {
            method: 'PUT',
            body: { number: '1', title: '1장 수정' },
          },
          200,
        );
        await change(
          'textbook_content',
          'update',
          `/api/textbooks/${book}/contents/order`,
          {
            method: 'PUT',
            body: { parentId: null, ids: [content] },
          },
          200,
        );
        await change(
          'textbook_content',
          'create',
          `/api/textbooks/${book}/contents/bulk`,
          {
            method: 'POST',
            body: { entries: [{ level: 0, number: '2', title: '2장' }] },
          },
          201,
        );

        const exercises = `/api/textbooks/${book}/contents/${content}/exercises`;
        const exercise = idOf(
          await change(
            'exercise',
            'create',
            exercises,
            {
              method: 'POST',
              body: { number: '1', body: '문제' },
            },
            201,
          ),
          'exercise',
        );
        await change(
          'exercise',
          'update',
          `/api/exercises/${exercise}`,
          {
            method: 'PUT',
            body: { number: '1', body: '문제 수정' },
          },
          200,
        );
        await change(
          'exercise',
          'update',
          `/api/exercises/${exercise}/important`,
          {
            method: 'PATCH',
            body: { important: true },
          },
          200,
        );
        await change(
          'exercise_answer',
          'update',
          `/api/exercises/${exercise}/answer`,
          {
            method: 'PUT',
            body: { body: '답' },
          },
          200,
        );
        await change(
          'exercise_answer',
          'delete',
          `/api/exercises/${exercise}/answer`,
          {
            method: 'DELETE',
          },
          204,
        );
        await change('exercise', 'delete', `/api/exercises/${exercise}`, { method: 'DELETE' }, 204);
        await change(
          'exercise',
          'create',
          `${exercises}/bulk`,
          {
            method: 'POST',
            body: { exercises: [{ number: '2', body: '문제 2', important: false, answer: null }] },
          },
          201,
        );

        await change(
          'textbook_content',
          'delete',
          `/api/textbooks/${book}/contents/${content}`,
          {
            method: 'DELETE',
          },
          204,
        );
        await change('textbook', 'delete', `/api/textbooks/${book}`, { method: 'DELETE' }, 204);
      });

      await t.test('study logs and their reviews', async () => {
        const log = idOf(
          await change(
            'study_log',
            'create',
            '/api/study-logs',
            {
              method: 'POST',
              body: {
                studyDate: '8053-03-10',
                startTime: '09:00',
                endTime: '10:00',
                status: 'done',
                memo: '비공개 메모',
              },
            },
            201,
          ),
          'studyLog',
        );
        const { rows } = await pool.query<{ id: number }>(
          'SELECT id FROM reviews WHERE study_log_id = $1',
          [log],
        );
        await change(
          'review',
          'update',
          `/api/reviews/${rows[0].id}/due-date`,
          {
            method: 'PUT',
            body: { dueDate: '8053-03-20' },
          },
          200,
        );
        await change(
          'study_log',
          'update',
          `/api/study-logs/${log}`,
          {
            method: 'PUT',
            body: {
              studyDate: '8053-03-10',
              startTime: '09:00',
              endTime: '10:30',
              status: 'done',
              memo: '',
            },
          },
          200,
        );
        // The memo text never reaches the log.
        const { rows: leaked } = await pool.query(
          "SELECT 1 FROM audit_log WHERE request_id LIKE $1 AND (after::text LIKE '%비공개%')",
          [`${run}%`],
        );
        assert.equal(leaked.length, 0);
        await change('study_log', 'delete', `/api/study-logs/${log}`, { method: 'DELETE' }, 204);
      });

      await t.test('retrospectives', async () => {
        const period = (await call('/api/retrospectives/period?kind=weekly&date=8053-03-10'))
          .data as {
          from: string;
        };
        const path = `/api/retrospectives/weekly/${period.from}`;
        await change(
          'retrospective',
          'create',
          path,
          { method: 'PUT', body: { body: '회고' } },
          200,
        );
        await change(
          'retrospective',
          'update',
          path,
          { method: 'PUT', body: { body: '회고 2' } },
          200,
        );
        await change('retrospective', 'delete', path, { method: 'DELETE' }, 204);
      });

      await t.test('schedules and their days', async () => {
        const made = await change(
          'schedule',
          'create',
          '/api/schedules',
          {
            method: 'POST',
            body: {
              title: '감사 일정',
              startDate: '8053-03-10',
              endDate: '8053-03-12',
              weekdayMinutes: 60,
              restDayMinutes: 60,
            },
          },
          201,
        );
        const schedule = (made as { schedule: { id: number } }).schedule.id;
        const items = (made as { items: { id: number }[] }).items;
        await change(
          'schedule',
          'update',
          `/api/schedules/${schedule}`,
          {
            method: 'PUT',
            body: { title: '감사 일정 2' },
          },
          200,
        );
        await change(
          'schedule_item',
          'update',
          `/api/schedules/${schedule}/items/${items[0].id}/date`,
          {
            method: 'PUT',
            body: { date: '8053-03-20' },
          },
          200,
        );
        await change('schedule', 'delete', `/api/schedules/${schedule}`, { method: 'DELETE' }, 204);
      });
    },
    {
      today: () => '8053-03-01',
      holidayFetcher: async (year) => [{ date: `${year}-01-01`, name: '1월1일' }],
    },
  );
});
