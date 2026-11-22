# #270 Reads never write; chapters stay inside the schedule's textbook

Issue: https://github.com/sirloinbh/study-log/issues/270

## Purpose

- `GET /api/schedules` and `GET /api/schedules/:id` ran the catch-up (moving overdue days) on every read, one transaction per overdue schedule, and one failing schedule failed the list.
- Nothing tied `schedule_item_contents.textbook_id` to the schedule's textbook.

## Decision (user, via the coordinator, 2026-11-23: option A)

One batched UPDATE once per service day, run by an in-process hook after the first schedule request of the day. Failures are logged and retried on the next request. Changes to a schedule or its days still catch up first, under the schedule's lock. `docs/decisions/schedule-rules.md` section 4 is updated.

## Changes

- `backend/src/schedules.ts`: `catchUp` is now exported and runs one `SELECT ... FOR UPDATE` over the overdue schedules (in id order) and one batched `UPDATE`, in one transaction, only when something is behind. New `dailyCatchUp` middleware (once per service day, after `res` closes, retried on failure). The list and detail reads no longer call `catchUp`. The rename keeps it.
- `backend/src/app.ts`: registers `dailyCatchUp` before the schedule routes; option `scheduleCatchUp: false` turns it off for tests that move days at moments of their own.
- `database/migrations/022_schedule_chapter_textbook_match.sql`: a trigger refuses a `schedule_item_contents` row whose `textbook_id` is not the schedule's `textbook_id` (error code 23514). Rows already stored are not rechecked.
- Tests: `schedules.test.ts` (the list's own queries only read, the catch-up runs after the response once per day and again the next day, a failed catch-up does not fail the request and is retried); `schedule-adjust.integration.test.ts` (runs the catch-up by hand before each read and list; the lock-wait pattern follows the new lock statement); `schedule-chapter-textbook.integration.test.ts` (a chapter of another textbook is refused, one of its own is accepted).
- `docs/decisions/schedule-rules.md` section 4.

## Verification

- Unit tests run locally. The integration tests (trigger, adjust) need `TEST_DATABASE_URL`, so they ran in CI only.
- `npm run check`: see the PR.

## Limits

- The first schedule request of a day can show days up to one catch-up behind.
- The catch-up runs per server process; with one API process (this app) it runs once a day.
