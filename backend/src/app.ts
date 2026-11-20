import { meHandler } from '@sirloinbh/auth-client';
import express from 'express';
import type { Pool } from 'pg';
import { types } from 'pg';
import { ZodError } from 'zod/v4';

import { calendarRoutes } from './calendar.js';
import { exerciseFileRoutes, fileRoutes } from './exercise-files.js';
import { contentExerciseRoutes, exerciseRoutes, textbookExerciseRoutes } from './exercises.js';
import { claudeExtractor, type Extractor } from './extraction.js';
import { type FileStorage, s3Storage } from './file-storage.js';
import { dataPortalHolidays, type HolidayFetcher } from './holidays.js';
import { keywordRoutes } from './keywords.js';
import { retrospectiveRoutes } from './retrospectives.js';
import { reviewRoutes } from './reviews.js';
import { scheduleRoutes } from './schedules.js';
import { setInt8Parser } from './standard/db.js';
import { requestLog } from './standard/http.js';
import { apiRateLimit } from './standard/rate-limit.js';
import { statsRoutes } from './stats.js';
import { studyLogRoutes } from './study-logs.js';
import { textbookContentRoutes } from './textbook-contents.js';
import { textbookRoutes } from './textbooks.js';
import { claudeTranslator, type Translator } from './translation.js';

// DATE columns stay YYYY-MM-DD strings so the service time zone never shifts them.
types.setTypeParser(1082, (value) => value);

// BIGINT ids come back as JS numbers; a value a number cannot hold exactly throws (ADR-0025).
setInt8Parser(types);

const serviceTimeZone = 'Asia/Seoul';

// "Today" follows the service time zone, not the server clock's zone.
export function serviceDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: serviceTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function createApp(
  pool: Pool,
  options: {
    today?: () => string;
    translator?: Translator;
    extractor?: Extractor;
    holidayFetcher?: HolidayFetcher;
    fileStorage?: FileStorage;
    requestsPerMinute?: number;
    auth?: express.RequestHandler;
  } = {},
) {
  const fileStorage = options.fileStorage ?? s3Storage();
  const today = options.today ?? (() => serviceDate());
  const app = express();
  app.disable('x-powered-by');
  // First, so every later log line (the Claude usage lines too, #248) can carry the request ID.
  app.use(requestLog);
  // Before the body parser, so refused requests cost as little as possible.
  apiRateLimit(app, { limitPerMinute: options.requestsPerMinute });
  // A whole chapter of reviewed problems or answers (#30) can be larger than other requests.
  app.use(
    [
      '/api/textbooks/:textbookId/contents/:contentId/exercises/bulk',
      '/api/textbooks/:textbookId/contents/:contentId/exercises/answers',
    ],
    express.json({ limit: '2mb' }),
  );
  app.use(express.json({ limit: '256kb' }));
  // #221: the shared sign-in guards every /api route except /api/health, before any route registers.
  if (options.auth) app.use('/api', options.auth);
  app.get('/api/me', meHandler);
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'study-log', today: today() });
  });
  // Before the study log routes, where 'calendar' would be read as a log id.
  app.use('/api/study-logs/calendar', calendarRoutes(pool, today));
  app.use('/api/study-logs', studyLogRoutes(pool));
  app.use('/api/reviews', reviewRoutes(pool, today));
  app.use('/api/keywords', keywordRoutes(pool, today));
  app.use('/api/stats', statsRoutes(pool, today));
  app.use('/api/retrospectives', retrospectiveRoutes(pool, today));
  app.use(
    '/api/schedules',
    scheduleRoutes(pool, today, options.holidayFetcher ?? dataPortalHolidays()),
  );
  app.use(
    '/api/textbooks/:textbookId/contents/:contentId/exercises',
    contentExerciseRoutes(pool, options.extractor ?? claudeExtractor()),
  );
  app.use('/api/textbooks/:textbookId/contents', textbookContentRoutes(pool, fileStorage));
  app.use('/api/textbooks/:textbookId/exercises', textbookExerciseRoutes(pool));
  app.use('/api/exercises/:id/files', exerciseFileRoutes(pool, fileStorage));
  app.use('/api/exercise-files', fileRoutes(pool, fileStorage));
  app.use(
    '/api/exercises',
    exerciseRoutes(pool, options.translator ?? claudeTranslator(), fileStorage),
  );
  app.use('/api/textbooks', textbookRoutes(pool, fileStorage));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API not found' });
  });
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err instanceof ZodError) {
        res.status(400).json({ error: err.issues.map((issue) => issue.message).join(', ') });
        return;
      }
      const error =
        typeof err === 'object' && err !== null
          ? (err as { code?: unknown; type?: unknown; status?: unknown })
          : {};
      // express.json() rejects malformed or oversized bodies before any route runs.
      if (error.type === 'entity.parse.failed') {
        res.status(400).json({ error: 'Request body is not valid JSON' });
        return;
      }
      if (error.type === 'entity.too.large') {
        res.status(413).json({ error: 'Request body is too large' });
        return;
      }
      // Other client errors raised before routing (unsupported charset or encoding, aborted
      // request) keep their 4xx status instead of turning into a logged 500.
      if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
        res.status(error.status).json({ error: 'Cannot process the request' });
        return;
      }
      // PostgreSQL text cannot hold a NUL character; it refuses the value as an invalid byte
      // sequence. That is the client's input, not a server fault (#58).
      if (error.code === '22021') {
        res.status(400).json({ error: 'Input contains a character that is not allowed (NUL)' });
        return;
      }
      if (error.code === '23505') {
        res.status(409).json({ error: 'This item already exists' });
        return;
      }
      console.error(
        JSON.stringify({
          event: 'request_error',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      res.status(500).json({ error: 'Server error' });
    },
  );
  return app;
}
