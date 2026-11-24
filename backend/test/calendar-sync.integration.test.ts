import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

import { Pool } from 'pg';

import type { CalendarEvent, GoogleCalendarClient } from '../src/google-calendar.js';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const key = randomBytes(32);
const marker = 'cal366';
const today = '7003-01-01';

// A Google that keeps its events in memory.
function fakeGoogle() {
  const events = new Map<string, CalendarEvent>();
  const log: string[] = [];
  let next = 0;
  const client: GoogleCalendarClient = {
    authUrl: (_config, state) => `https://accounts.example/auth?state=${state}`,
    exchangeCode: async (_config, code) => {
      if (code !== 'good') throw new Error('bad code');
      return 'refresh-1';
    },
    accessToken: async (_config, refresh) => {
      if (refresh !== 'refresh-1') throw new Error('unexpected refresh token');
      return 'access-1';
    },
    revoke: async () => void log.push('revoke'),
    createCalendar: async () => 'calendar-1',
    insertEvent: async (_access, _calendar, event) => {
      const id = `e${++next}`;
      events.set(id, event);
      log.push('insert');
      return id;
    },
    updateEvent: async (_access, _calendar, id, event) => {
      if (!events.has(id)) return false;
      events.set(id, event);
      log.push('update');
      return true;
    },
    deleteEvent: async (_access, _calendar, id) => {
      events.delete(id);
      log.push('delete');
    },
  };
  // Only this test's rows: the shared test DB may hold others.
  const mine = () =>
    [...events.entries()]
      .filter(([, event]) => event.summary.includes(marker))
      .map(([id, event]) => ({ id, summary: event.summary, date: event.date }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { client, mine, log, all: () => events.values() };
}

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'the calendar follows schedule items and reviews, and disconnecting stops it',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const cleanup = async () => {
      await pool.query('DELETE FROM calendar_events');
      await pool.query('DELETE FROM calendar_connection');
      await pool.query('DELETE FROM schedules WHERE title LIKE $1', [`${marker}%`]);
      await pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${marker}%`]);
      await pool.query(
        `DELETE FROM study_logs WHERE study_date BETWEEN '7002-12-01' AND '7003-12-31'`,
      );
    };
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });

    const google = fakeGoogle();
    const settings = () => ({
      tokenKey: key,
      config: { clientId: 'id', clientSecret: 'secret', redirectUri: 'https://x.test/cb' },
    });
    const options = {
      today: () => today,
      googleCalendarClient: google.client,
      calendarSettings: settings,
      calendarSyncDelayMs: 0,
      scheduleCatchUp: false,
    };

    await withApi(
      pool,
      async (call) => {
        assert.deepEqual((await call('/api/calendar-sync/status')).data, {
          configured: true,
          connected: false,
          calendarName: 'Study log',
          connectedAt: null,
          lastSyncedAt: null,
          lastError: null,
          events: 0,
        });
        assert.equal((await call('/api/calendar-sync/sync', { method: 'POST' })).status, 409);

        // Sign-in: the address carries a state this server signed; the callback checks it.
        const connect = await call('/api/calendar-sync/connect', { method: 'POST' });
        const state = new URL(String(connect.data.url)).searchParams.get('state')!;
        await call('/api/calendar-sync/callback?code=bad&state=nonsense');
        assert.equal(
          (await pool.query('SELECT 1 FROM calendar_connection')).rowCount,
          0,
          'bad state',
        );
        await call(`/api/calendar-sync/callback?code=good&state=${state}`);
        const saved = await pool.query<{ enc: string; calendarId: string }>(
          'SELECT refresh_token_enc AS enc, calendar_id AS "calendarId" FROM calendar_connection',
        );
        assert.equal(saved.rows[0].calendarId, 'calendar-1');
        assert.ok(
          !saved.rows[0].enc.includes('refresh-1'),
          'the token is not stored as plain text',
        );

        // Data: a schedule with two open items and one done item, and a done study log's round 1.
        const schedule = await pool.query<{ id: number }>(
          `INSERT INTO schedules (title, start_date, end_date, weekday_minutes, rest_day_minutes)
         VALUES ($1, '7003-01-05', '7003-01-07', 90, 30) RETURNING id`,
          [`${marker} Algorithms`],
        );
        const [a, b] = (
          await pool.query<{ id: number }>(
            `INSERT INTO schedule_items (schedule_id, item_date, original_date, target_minutes)
           VALUES ($1, '7003-01-05', '7003-01-05', 90), ($1, '7003-01-06', '7003-01-06', 30)
           RETURNING id`,
            [schedule.rows[0].id],
          )
        ).rows;
        await pool.query(
          `INSERT INTO schedule_items (schedule_id, item_date, original_date, target_minutes, completed_on)
         VALUES ($1, '7003-01-07', '7003-01-07', 60, '7003-01-07')`,
          [schedule.rows[0].id],
        );
        const log = await pool.query<{ id: number }>(
          `INSERT INTO study_logs (study_date, start_time, end_time, duration_minutes, memo, status)
         VALUES ('7003-01-02', '09:00', '10:00', 60, $1, 'done') RETURNING id`,
          [`${marker} private memo`],
        );
        const review = await pool.query<{ id: number }>(
          `INSERT INTO reviews (study_log_id, round, due_date, original_due_date)
         VALUES ($1, 1, '7003-01-03', '7003-01-03') RETURNING id`,
          [log.rows[0].id],
        );

        const synced = await call('/api/calendar-sync/sync', { method: 'POST' });
        assert.equal(synced.status, 200);
        // The study log has no textbook, so the review is named after its date; no memo text is sent.
        assert.deepEqual(
          google.mine().map(({ summary, date }) => [summary, date]),
          [
            [`${marker} Algorithms (1 h 30 min)`, '7003-01-05'],
            [`${marker} Algorithms (30 min)`, '7003-01-06'],
          ],
          'the done item has no event',
        );

        // Moving an item moves its event: the change itself starts the sync.
        await pool.query(`UPDATE schedule_items SET item_date = '7003-01-09' WHERE id = $1`, [
          a.id,
        ]);
        await call('/api/reviews/today/count');
        await call(`/api/reviews/${review.rows[0].id}/due-date`, {
          method: 'PUT',
          body: { dueDate: '7003-01-04' },
        });
        await waitFor(() => google.mine().some((event) => event.date === '7003-01-09'));
        assert.ok(google.mine().some((event) => event.date === '7003-01-09'));

        // Completing an item and deleting a schedule remove events.
        await pool.query(`UPDATE schedule_items SET completed_on = '7003-01-06' WHERE id = $1`, [
          b.id,
        ]);
        await call('/api/calendar-sync/sync', { method: 'POST' });
        assert.deepEqual(
          google.mine().map((event) => event.date),
          ['7003-01-09'],
        );
        const status = (await call('/api/calendar-sync/status')).data;
        assert.equal(status.connected, true);
        assert.equal(status.lastError, null);
        assert.ok(status.lastSyncedAt);

        // An exercise I got wrong has a review date (#403): it becomes an event, moves, and goes when
        // the cycle ends. Only the textbook, chapter and number are sent, never the exercise text.
        const book = await pool.query<{ id: number }>(
          'INSERT INTO textbooks (title) VALUES ($1) RETURNING id',
          [`${marker} Linear Algebra`],
        );
        const chapter = await pool.query<{ id: number }>(
          `INSERT INTO textbook_contents (textbook_id, parent_id, position, number, title)
           VALUES ($1, NULL, 0, '1', 'Vectors') RETURNING id`,
          [book.rows[0].id],
        );
        const exercise = await pool.query<{ id: number }>(
          `INSERT INTO exercises (textbook_id, content_id, number, body)
           VALUES ($1, $2, '3', 'private exercise text') RETURNING id`,
          [book.rows[0].id, chapter.rows[0].id],
        );
        await pool.query(
          `INSERT INTO exercise_reviews (exercise_id, step, due_date) VALUES ($1, 2, '7003-01-11')`,
          [exercise.rows[0].id],
        );
        await call('/api/calendar-sync/sync', { method: 'POST' });
        assert.deepEqual(
          google.mine().map(({ summary, date }) => [summary, date]),
          [
            [`${marker} Algorithms (1 h 30 min)`, '7003-01-09'],
            [`Exercise review 2/4: ${marker} Linear Algebra, Vectors #3`, '7003-01-11'],
          ],
        );
        assert.ok(![...google.all()].some((event) => event.description.includes('private')));
        await pool.query(
          `UPDATE exercise_reviews SET step = 3, due_date = '7003-01-14' WHERE exercise_id = $1`,
          [exercise.rows[0].id],
        );
        await call('/api/calendar-sync/sync', { method: 'POST' });
        assert.ok(google.mine().some((event) => event.date === '7003-01-14'));
        await pool.query('DELETE FROM exercise_reviews WHERE exercise_id = $1', [
          exercise.rows[0].id,
        ]);
        await call('/api/calendar-sync/sync', { method: 'POST' });
        assert.deepEqual(
          google.mine().map((event) => event.date),
          ['7003-01-09'],
        );

        // A sync run does not repeat what is already there.
        const before = google.log.length;
        await call('/api/calendar-sync/sync', { method: 'POST' });
        assert.equal(google.log.length, before);

        // Disconnecting forgets everything here and revokes the access.
        assert.equal((await call('/api/calendar-sync', { method: 'DELETE' })).status, 204);
        assert.ok(google.log.includes('revoke'));
        assert.equal((await pool.query('SELECT 1 FROM calendar_connection')).rowCount, 0);
        assert.equal((await pool.query('SELECT 1 FROM calendar_events')).rowCount, 0);
        assert.equal((await call('/api/calendar-sync/sync', { method: 'POST' })).status, 409);
        assert.equal((await call('/api/calendar-sync', { method: 'DELETE' })).status, 404);
      },
      options as never,
    );
  },
);

test(
  'without the server settings the routes say so, and nothing is connected',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    t.after(() => pool.end());
    await withApi(
      pool,
      async (call) => {
        const status = await call('/api/calendar-sync/status');
        assert.equal(status.data.configured, false);
        const connect = await call('/api/calendar-sync/connect', { method: 'POST' });
        assert.equal(connect.status, 503);
        assert.match(String(connect.data.error), /not set up/);
      },
      {
        today: () => today,
        calendarSettings: () => ({ tokenKey: undefined, config: undefined }),
      } as never,
    );
  },
);

async function waitFor(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++) await new Promise((resolve) => setTimeout(resolve, 20));
}
