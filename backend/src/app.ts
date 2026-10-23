import express from 'express';
import type { Pool } from 'pg';
import { types } from 'pg';
import { ZodError } from 'zod';
import { calendarRoutes } from './calendar.js';
import { keywordRoutes } from './keywords.js';
import { statsRoutes } from './stats.js';
import { studyLogRoutes } from './study-logs.js';
import { contentExerciseRoutes, exerciseRoutes, textbookExerciseRoutes } from './exercises.js';
import { textbookContentRoutes } from './textbook-contents.js';
import { textbookRoutes } from './textbooks.js';

// DATE columns stay YYYY-MM-DD strings so the service time zone never shifts them.
types.setTypeParser(1082, (value) => value);

// BIGINT ids come back as JS numbers (#67). The API accepts ids of up to 15 digits, all exact as
// numbers, so ids need no ::int cast that would fail past 2^31. A value a number cannot hold
// exactly is refused rather than silently rounded.
types.setTypeParser(20, (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`bigint ${value} does not fit a JS number`);
  return number;
});

export const serviceTimeZone = 'Asia/Seoul';

// "Today" follows the service time zone, not the server clock's zone.
export function serviceDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: serviceTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function createApp(pool: Pool, options: { today?: () => string } = {}) {
  const today = options.today ?? (() => serviceDate());
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'study-log', today: today() });
  });
  // Before the study log routes, where 'calendar' would be read as a log id.
  app.use('/api/study-logs/calendar', calendarRoutes(pool, today));
  app.use('/api/study-logs', studyLogRoutes(pool));
  app.use('/api/keywords', keywordRoutes(pool, today));
  app.use('/api/stats', statsRoutes(pool, today));
  app.use('/api/textbooks/:textbookId/contents/:contentId/exercises', contentExerciseRoutes(pool));
  app.use('/api/textbooks/:textbookId/contents', textbookContentRoutes(pool));
  app.use('/api/textbooks/:textbookId/exercises', textbookExerciseRoutes(pool));
  app.use('/api/exercises', exerciseRoutes(pool));
  app.use('/api/textbooks', textbookRoutes(pool));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: '요청한 API를 찾을 수 없습니다' });
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
        res.status(400).json({ error: '요청 본문의 JSON 형식이 올바르지 않습니다' });
        return;
      }
      if (error.type === 'entity.too.large') {
        res.status(413).json({ error: '요청 본문이 너무 큽니다' });
        return;
      }
      // Other client errors raised before routing (unsupported charset or encoding, aborted
      // request) keep their 4xx status instead of turning into a logged 500.
      if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
        res.status(error.status).json({ error: '요청을 처리할 수 없습니다' });
        return;
      }
      // PostgreSQL text cannot hold a NUL character; it refuses the value as an invalid byte
      // sequence. That is the client's input, not a server fault (#58).
      if (error.code === '22021') {
        res.status(400).json({ error: '입력에 사용할 수 없는 문자(NUL)가 있습니다' });
        return;
      }
      if (error.code === '23505') {
        res.status(409).json({ error: '이미 등록된 항목입니다' });
        return;
      }
      console.error(
        JSON.stringify({
          event: 'request_error',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      res.status(500).json({ error: '서버 오류가 발생했습니다' });
    },
  );
  return app;
}
