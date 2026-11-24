# #403 Exercise wrong-answer reviews in the Google Calendar sync

Issue: https://github.com/sirloinbh/study-log/issues/403 (epic #354). Extends #366 (`docs/changes/366-google-calendar-sync.md`); requested by the coordinator and approved by the user.

## Changes

- `backend/src/calendar-sync.ts`: the wanted events now include every `exercise_reviews` row (#358, the 1/3/7/14-day steps) as an all-day event on its due date, titled `Exercise review <step>/4: <textbook>, <chapter> #<number>`. The exercise text is not sent. The exercise id is the event's source id, so a moved date updates the event and an ended cycle (or deleted exercise) removes it.
- `database/migrations/035_calendar_events_exercise_review.sql`: `calendar_events.source` also allows `exercise_review` (drop and re-add the check, safe to run again).
- `backend/src/app.ts`: the sync trigger also covers `/api/exercises` and `/api/exercise-attempts`, where attempts (which move the review) are saved.
- Tests: the plan keeps exercise reviews apart from items and reviews; the DB integration test adds, moves and ends an exercise review and checks no exercise text reaches the calendar.

## Verification

- `npm run check` (results in the PR). The DB integration test needs `TEST_DATABASE_URL`; it runs in CI only unless a test DB is available locally.
- Real Google use still waits on #367.
