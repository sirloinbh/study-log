# 474: Remove the study timer

Part of epic #468 (slim down the study log screens).

## What changed

- Removed the "Study timer" card from the study log page: `frontend/src/study-timer.tsx` and its test are deleted, and `study-logs.tsx` no longer renders it.
- Removed the API: `backend/src/study-timer.ts`, its integration test, the route mount and calendar-sync hook entry in `backend/src/app.ts`, the OpenAPI entries, and the regenerated `docs/openapi.json`. `/api/study-timer` now returns 404.
- Removed the `fake-api` stub and the `screens.test.tsx` handler for the timer.
- `database/migrations/037_drop_study_timer.sql` drops the `study_timer` table (a single-row table that held at most one transient timer). Migration 026 is untouched.

## Decision

- Study time is entered by hand with the Start and End fields of the log form, which already compute the minutes. No new field was added, so the 2-hour daily goal still works.

## Tests

- Existing study log form and screen tests still cover Start and End saving the minutes. See the PR for the check results.
