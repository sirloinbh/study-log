# 360: Study timer

## Decisions (recorded on the issue, 2026-11-23)

- Paused time is subtracted from `duration_minutes`; the log's start and end times are the clock times of the start and the stop (the pause when stopped while paused).
- A session that passes midnight belongs to its start date, as study logs already do. Dates and times use `Asia/Seoul`.

## What changed

- `database/migrations/026_study_timer.sql`: table `study_timer` with at most one row (`id = 1`): `started_at`, `paused_at`, `paused_seconds`.
- `backend/src/study-timer.ts`, mounted at `/api/study-timer`: `GET` (the timer with its studied seconds, or null), `POST /start`, `/pause`, `/resume`, `/stop` (creates a done study log with its first review, then removes the timer), `DELETE` (cancel). The time is counted in the database clock, so a reload or another tab shows the same value. A second start, a pause without a timer and similar give 409; stopping under a minute or over 23 h 59 min gives 400 and keeps the timer (the log table allows 1 to 1439 minutes).
- `docs/openapi.json` and the operation table list the six routes. Every write is audited.
- Frontend `study-timer.tsx`: a "Study timer" card at the top of the study log page with start, pause, resume, stop and save, and discard (behind the shared confirm dialog). The display counts seconds since the last server answer. Stopping reloads the recent list, the calendar and the review badge.
- `test/fake-api.ts` answers `GET /api/study-timer` with no timer when a test has no handler for it, so the existing study log tests need no change except the one with a catch-all handler (`screens.test.tsx`).

## Tests

- `backend/test/study-timer.integration.test.ts` (needs `TEST_DATABASE_URL`): the full cycle with the 409/404/400 cases, 30 minutes since the start with 10 paused = 25 studied after a 5-minute pause, a reload showing the same time, a stop while paused ending at the pause, a session from 23:50 to 00:20 keeping its start day, and a forgotten timer refused.
- `frontend/src/study-timer.test.tsx`: start, shown time, pause and resume, stop (status text and callback), a refused stop, discard with its confirmation, a failed load.

## Checked

- Browser (Vite, mock API; the mock has no database): 390x844 and 1440x900, start, ticking, pause freezes the time, a reload keeps the paused time, resume, stop shows "Saved a study log of 25 min", no overflow.
- The backend integration tests ran in CI only (no local test DB). `npm run check` and CI: see the PR.
