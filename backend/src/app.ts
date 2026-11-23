import { meHandler } from '@sirloinbh/auth-client';
import express from 'express';
import type { Pool } from 'pg';
import { types } from 'pg';

import { tools } from './ai-tools.js';
import { calendarRoutes } from './calendar.js';
import { codingRoutes } from './coding-problems.js';
import { solvedAcRoutes } from './coding-solvedac.js';
import { refuseCrossSiteWrites } from './cross-site.js';
import { attemptRoutes, exerciseAttemptRoutes, wrongExerciseRoutes } from './exercise-attempts.js';
import { exerciseFileRoutes, fileRoutes } from './exercise-files.js';
import { contentExerciseRoutes, exerciseRoutes, textbookExerciseRoutes } from './exercises.js';
import { claudeExtractor, type Extractor } from './extraction.js';
import { type FileStorage, s3Storage } from './file-storage.js';
import { dataPortalHolidays, type HolidayFetcher } from './holidays.js';
import { flashcardRoutes } from './keyword-flashcards.js';
import { keywordRoutes } from './keywords.js';
import { claudeDrafter, type Drafter } from './retrospective-draft.js';
import { retrospectiveRoutes } from './retrospectives.js';
import { reviewRoutes } from './reviews.js';
import { dailyCatchUp, scheduleRoutes } from './schedules.js';
import { type SolvedAcClient, solvedAcClient } from './solvedac.js';
import { setInt8Parser } from './standard/db.js';
import { errorHandler, notFound, requestLog, serviceDate } from './standard/http.js';
import { apiRateLimit } from './standard/rate-limit.js';
import { registerToolRoutes } from './standard/tools.js';
import { statsRoutes } from './stats.js';
import { studyGoalRoutes } from './study-goal.js';
import { studyLogRoutes } from './study-logs.js';
import { studyTimerRoutes } from './study-timer.js';
import { textbookContentRoutes } from './textbook-contents.js';
import { textbookRoutes } from './textbooks.js';
import { claudeTranslator, type Translator } from './translation.js';

// DATE columns stay YYYY-MM-DD strings so the service time zone never shifts them.
types.setTypeParser(1082, (value) => value);

// BIGINT ids come back as JS numbers; a value a number cannot hold exactly throws (ADR-0025).
setInt8Parser(types);

export function createApp(
  pool: Pool,
  options: {
    today?: () => string;
    translator?: Translator;
    drafter?: Drafter;
    extractor?: Extractor;
    holidayFetcher?: HolidayFetcher;
    fileStorage?: FileStorage;
    requestsPerMinute?: number;
    auth?: express.RequestHandler;
    // Off in the schedule tests, which move the days at moments of their own (#270).
    scheduleCatchUp?: boolean;
    toolsPublicKey?: string;
    solvedAcClient?: SolvedAcClient;
    // The solved.ac account to import from (SOLVEDAC_HANDLE) (#369).
    solvedAcHandle?: string;
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
  // Before the body parser too: a request from another site's page is refused at once (#333).
  app.use('/api', refuseCrossSiteWrites);
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
  // Moves overdue schedule days once a day, after the first schedule response, so no read writes (#270).
  if (options.scheduleCatchUp !== false) app.use('/api/schedules', dailyCatchUp(pool, today));
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'study-log', today: today() });
  });
  // Before the study log routes, where 'calendar' would be read as a log id.
  app.use('/api/study-logs/calendar', calendarRoutes(pool, today));
  app.use('/api/study-logs', studyLogRoutes(pool));
  app.use('/api/study-timer', studyTimerRoutes(pool));
  app.use('/api/reviews', reviewRoutes(pool, today));
  app.use('/api/keywords', keywordRoutes(pool, today));
  app.use('/api/flashcards', flashcardRoutes(pool, today));
  app.use(
    '/api/coding/solvedac',
    solvedAcRoutes(
      pool,
      options.solvedAcClient ?? solvedAcClient(),
      () => options.solvedAcHandle ?? process.env.SOLVEDAC_HANDLE,
    ),
  );
  app.use('/api/coding', codingRoutes(pool, today));
  // Before the stats routes, so '/goal' is not looked up there.
  app.use('/api/stats/goal', studyGoalRoutes(pool, today));
  app.use('/api/stats', statsRoutes(pool, today));
  app.use(
    '/api/retrospectives',
    retrospectiveRoutes(pool, today, options.drafter ?? claudeDrafter()),
  );
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
  app.use('/api/exercises/wrong', wrongExerciseRoutes(pool));
  app.use('/api/exercises/:id/attempts', exerciseAttemptRoutes(pool, today));
  app.use('/api/exercise-attempts', attemptRoutes(pool));
  app.use('/api/exercises/:id/files', exerciseFileRoutes(pool, fileStorage));
  app.use('/api/exercise-files', fileRoutes(pool, fileStorage));
  app.use(
    '/api/exercises',
    exerciseRoutes(pool, options.translator ?? claudeTranslator(), fileStorage),
  );
  app.use('/api/textbooks', textbookRoutes(pool, fileStorage));
  // #711: shared-ai calls the AI tools here with a signed token. Outside /api, so the proxy never reaches it.
  registerToolRoutes(app, {
    app: 'study-log',
    tools,
    pool,
    publicKey: options.toolsPublicKey,
    requireBinding: true,
  });
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
