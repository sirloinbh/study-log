import {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  Router,
} from 'express';
import type { Pool } from 'pg';

import { auditChange } from './audit-log.js';
import { checkState, decryptToken, encryptToken, makeState, parseKey } from './calendar-crypto.js';
import { type Mapped, planSync, type Wanted } from './calendar-sync-plan.js';
import {
  type CalendarEvent,
  type GoogleCalendarClient,
  type GoogleConfig,
  GoogleError,
} from './google-calendar.js';
import { inTransaction } from './sql.js';
import { HttpError } from './standard/http.js';

// One-way sync of schedule items and review due dates to a "Study log" Google calendar (#366).
// Nothing is read back from Google. Rather than hooking every place that changes an item or a
// review, each sync compares what the app holds now with the events it made before and fixes the
// difference, so a missed trigger is repaired by the next one.
export const calendarName = 'Study log';

export type CalendarSettings = {
  config: GoogleConfig | undefined;
  tokenKey: Buffer | undefined;
};

// Read per request, so the values can be set after start.
export function settingsFromEnv(env: NodeJS.ProcessEnv = process.env): CalendarSettings {
  const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret, GOOGLE_REDIRECT_URI: redirect } = env;
  const tokenKey = parseKey(env.CALENDAR_TOKEN_KEY);
  return {
    tokenKey,
    config:
      id && secret && redirect && tokenKey
        ? { clientId: id, clientSecret: secret, redirectUri: redirect }
        : undefined,
  };
}

const minutesText = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
    : `${minutes} min`;

// Open schedule items from today on, and every open review round. Only titles and dates go to
// Google, never memos or answers.
export async function wantedEvents(pool: Pool, today: string): Promise<Wanted[]> {
  const items = await pool.query<{ id: number; date: string; minutes: number; title: string }>(
    `SELECT i.id, i.item_date AS date, i.target_minutes AS minutes, s.title
     FROM schedule_items i JOIN schedules s ON s.id = i.schedule_id
     WHERE i.completed_on IS NULL AND i.item_date >= $1::date`,
    [today],
  );
  const reviews = await pool.query<{ id: number; date: string; round: number; title: string }>(
    `SELECT r.id, r.due_date AS date, r.round,
       COALESCE(c.title, t.title, 'Study of ' || l.study_date::text) AS title
     FROM reviews r
     JOIN study_logs l ON l.id = r.study_log_id
     LEFT JOIN textbooks t ON t.id = l.textbook_id
     LEFT JOIN textbook_contents c ON c.id = l.content_id
     WHERE r.completed_on IS NULL`,
  );
  return [
    ...items.rows.map((row) => ({
      source: 'schedule_item' as const,
      sourceId: row.id,
      date: row.date,
      summary: `${row.title} (${minutesText(row.minutes)})`,
    })),
    ...reviews.rows.map((row) => ({
      source: 'review' as const,
      sourceId: row.id,
      date: row.date,
      summary: `Review ${row.round}/5: ${row.title}`,
    })),
  ];
}

const describe = (item: Wanted): CalendarEvent => ({
  summary: item.summary,
  date: item.date,
  description:
    item.source === 'review'
      ? 'Review round from the study log app'
      : 'Planned study time from the study log app',
});

type Connection = { refreshTokenEnc: string; calendarId: string };

const loadConnection = async (pool: Pool) =>
  (
    await pool.query<Connection>(
      `SELECT refresh_token_enc AS "refreshTokenEnc", calendar_id AS "calendarId"
       FROM calendar_connection WHERE id = 1`,
    )
  ).rows[0];

export type SyncResult = { created: number; updated: number; removed: number };

async function recordOutcome(pool: Pool, error: string | null) {
  await pool.query(
    `UPDATE calendar_connection SET last_error = $1,
       last_synced_at = CASE WHEN $1::text IS NULL THEN now() ELSE last_synced_at END WHERE id = 1`,
    [error],
  );
}

// Makes the calendar match the app. Each event is saved as soon as Google accepts it, so a failure
// part-way keeps the progress. Returns undefined when nothing is connected.
export async function syncNow(
  pool: Pool,
  client: GoogleCalendarClient,
  settings: CalendarSettings,
  today: string,
): Promise<SyncResult | undefined> {
  const connection = await loadConnection(pool);
  if (!connection) return undefined;
  const { config, tokenKey } = settings;
  if (!config || !tokenKey) throw new GoogleError('Google sync is not set up on the server');
  try {
    const refresh = decryptToken(connection.refreshTokenEnc, tokenKey);
    const access = await client.accessToken(config, refresh);
    const { rows } = await pool.query<Mapped>(
      `SELECT source, source_id AS "sourceId", event_id AS "eventId", event_date AS date, summary
       FROM calendar_events`,
    );
    const plan = planSync(await wantedEvents(pool, today), rows);
    const result: SyncResult = { created: 0, updated: 0, removed: 0 };
    const save = (item: Wanted, eventId: string) =>
      pool.query(
        `INSERT INTO calendar_events (source, source_id, event_id, event_date, summary)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (source, source_id) DO UPDATE
           SET event_id = $3, event_date = $4, summary = $5`,
        [item.source, item.sourceId, eventId, item.date, item.summary],
      );
    for (const item of plan.remove) {
      await client.deleteEvent(access, connection.calendarId, item.eventId);
      await pool.query('DELETE FROM calendar_events WHERE source = $1 AND source_id = $2', [
        item.source,
        item.sourceId,
      ]);
      result.removed++;
    }
    for (const item of plan.update) {
      if (await client.updateEvent(access, connection.calendarId, item.eventId, describe(item))) {
        await save(item, item.eventId);
        result.updated++;
      } else {
        // Deleted by hand in Google: make it again.
        await save(item, await client.insertEvent(access, connection.calendarId, describe(item)));
        result.created++;
      }
    }
    for (const item of plan.create) {
      await save(item, await client.insertEvent(access, connection.calendarId, describe(item)));
      result.created++;
    }
    await recordOutcome(pool, null);
    return result;
  } catch (error) {
    // The message is shown on the settings page; a failure that is not Google's stays generic.
    const message = error instanceof GoogleError ? error.message : 'The sync failed unexpectedly';
    await recordOutcome(pool, message).catch(() => undefined);
    throw error;
  }
}

// Runs syncs one at a time, so two runs never create the same event twice. A trigger waits a moment
// first, so one request's several changes (and the daily day move) become one sync.
export function syncRunner(
  pool: Pool,
  client: GoogleCalendarClient,
  settings: () => CalendarSettings,
  today: () => string,
  delayMs = 1500,
) {
  let chain: Promise<unknown> = Promise.resolve();
  let pending = 0;
  let timer: NodeJS.Timeout | undefined;
  // Runs after the syncs already queued; resolves with this run's result or rejects with its error.
  const now = () => {
    pending++;
    const run = chain.then(() => syncNow(pool, client, settings(), today()));
    chain = run.catch(() => undefined).finally(() => pending--);
    return run;
  };
  return {
    now,
    trigger() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        now().catch((error: unknown) =>
          // Already recorded for the settings page; the log gets the reason, never a token.
          console.error(
            JSON.stringify({
              event: 'calendar-sync-failed',
              reason: error instanceof GoogleError ? error.message : 'unexpected',
            }),
          ),
        );
      }, delayMs);
      timer.unref();
    },
    // For tests: resolves when no sync is waiting or running.
    async idle() {
      while (timer || pending > 0) await new Promise((resolve) => setTimeout(resolve, 5));
    },
  };
}

const quietMs = 10 * 60 * 1000;

// Mounted before the routes whose changes show up in the calendar. A change that went through starts
// a sync; reading the schedules does too (it moves overdue days), but at most every ten minutes.
export function calendarSyncHook(
  pool: Pool,
  runner: ReturnType<typeof syncRunner>,
): RequestHandler {
  let lastRead = 0;
  return (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      if (req.method === 'GET') {
        if (!req.baseUrl.startsWith('/api/schedules') || Date.now() - lastRead < quietMs) return;
        lastRead = Date.now();
      }
      Promise.resolve()
        .then(() => pool.query('SELECT 1 FROM calendar_connection WHERE id = 1'))
        .then(({ rowCount }) => rowCount && runner.trigger())
        .catch(() => undefined);
    });
    next();
  };
}

// /api/calendar-sync (#366).
export function calendarSyncRoutes(
  pool: Pool,
  client: GoogleCalendarClient,
  settings: () => CalendarSettings,
  runner: ReturnType<typeof syncRunner>,
) {
  const router = Router();
  const configured = () => {
    const { config, tokenKey } = settings();
    if (!config || !tokenKey)
      throw new HttpError(
        503,
        'Google sync is not set up on the server (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, CALENDAR_TOKEN_KEY)',
      );
    return { config, tokenKey };
  };
  const googleFailed = (error: unknown): never => {
    if (error instanceof GoogleError) throw new HttpError(503, error.message);
    throw error;
  };

  router.get('/status', async (_req, res) => {
    const { rows } = await pool.query<{
      calendarId: string;
      connectedAt: string;
      lastSyncedAt: string | null;
      lastError: string | null;
      events: number;
    }>(
      `SELECT c.calendar_id AS "calendarId", c.connected_at AS "connectedAt",
         c.last_synced_at AS "lastSyncedAt", c.last_error AS "lastError",
         (SELECT count(*)::int FROM calendar_events) AS events
       FROM calendar_connection c WHERE c.id = 1`,
    );
    const row = rows[0];
    res.json({
      configured: Boolean(settings().config),
      connected: Boolean(row),
      calendarName,
      connectedAt: row?.connectedAt ?? null,
      lastSyncedAt: row?.lastSyncedAt ?? null,
      lastError: row?.lastError ?? null,
      events: row?.events ?? 0,
    });
  });

  // The address of Google's sign-in page. The browser goes there and Google sends it back to /callback.
  router.post('/connect', (_req, res) => {
    const { config, tokenKey } = configured();
    res.json({ url: client.authUrl(config, makeState(tokenKey)) });
  });

  // Where Google sends the browser back to: saves the long-term access and makes the calendar.
  router.get('/callback', async (req, res) => {
    const { config, tokenKey } = configured();
    const back = (result: string) => res.redirect(`/settings?calendar=${result}`);
    const { code, state, error } = req.query;
    if (error || typeof code !== 'string' || typeof state !== 'string') return back('declined');
    if (!checkState(state, tokenKey)) return back('failed');
    try {
      const refresh = await client.exchangeCode(config, code);
      const calendarId = await client.createCalendar(
        await client.accessToken(config, refresh),
        calendarName,
      );
      await inTransaction(pool, async (db) => {
        await db.query('DELETE FROM calendar_events');
        await db.query(
          `INSERT INTO calendar_connection (id, refresh_token_enc, calendar_id)
           VALUES (1, $1, $2)
           ON CONFLICT (id) DO UPDATE SET refresh_token_enc = $1, calendar_id = $2,
             connected_at = now(), last_synced_at = NULL, last_error = NULL`,
          [encryptToken(refresh, tokenKey), calendarId],
        );
        await auditChange(req, res, db, 'create', 'calendar_connection', 1, {});
      });
    } catch {
      return back('failed');
    }
    back('connected');
  });

  router.post('/sync', async (_req, res) => {
    configured();
    const result = await runner.now().catch(googleFailed);
    if (!result) throw new HttpError(409, 'Google Calendar is not connected');
    res.json(result);
  });

  // Forgets the connection and revokes the access. The "Study log" calendar and its events stay in
  // Google, since they are the person's to delete.
  router.delete('/', async (req, res) => {
    const connection = await loadConnection(pool);
    if (!connection) throw new HttpError(404, 'Google Calendar is not connected');
    const { tokenKey } = settings();
    if (tokenKey) {
      try {
        await client.revoke(decryptToken(connection.refreshTokenEnc, tokenKey));
      } catch {
        // Revoking is best effort.
      }
    }
    await inTransaction(pool, async (db) => {
      await db.query('DELETE FROM calendar_events');
      await db.query('DELETE FROM calendar_connection WHERE id = 1');
      await auditChange(req, res, db, 'delete', 'calendar_connection', 1, {});
    });
    res.status(204).end();
  });

  return router;
}
