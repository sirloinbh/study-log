# #263 Audit rows for changes made through the HTTP API

Issue: https://github.com/sirloinbh/study-log/issues/263

## Purpose

The audit log header says "one row for each change", but only the AI tool calls wrote rows. Creating, changing and deleting study data through the HTTP routes left nothing.

## Changes

- `backend/src/audit-log.ts` (new): `auditChange(req, res, db, action, entity, entityId, summary)`. It wraps the managed `writeAudit` with the signed-in user and request ID from `auditContext`, and drops `memo`, `body`, `difficulties`, `understanding`, `answer` and `translation` keys if one slips into a summary.
- Every write route now writes its audit row with the client of the change's own transaction, so a change never lands without its row. Routes that used one `pool.query` became a small transaction (`inTransaction`).
  - `textbook`: create, update, delete.
  - `textbook_content`: create, bulk create, reorder, update, delete.
  - `exercise`: create, bulk create, update, important mark, delete. `exercise_answer`: save, bulk save, delete. `exercise_translation`: save. `exercise_file`: upload, delete.
  - `study_log`: create, update, delete.
  - `schedule`: create, rename, delete. `schedule_item`: complete, reopen, move.
  - `review`: complete, snooze, change due date.
  - `keyword` and `retrospective`: create, update, delete (the retrospective upsert tells create from update with `xmax = 0`).
- Summaries hold ids, titles, dates and counts only. No memo, problem or answer text is stored.
- `backend/test/helpers.ts`: `withApi` now gives a hand-made pool (not a real pg Pool) a `connect` if it has none, and its clients answer the audit insert (and BEGIN/COMMIT/ROLLBACK for a pool with only `query`) on their own, so unit tests see only the statements they care about.
- Tests changed for the new transactions: `textbook-contents.test.ts` (the entry rename is now a transaction and commits), `zod4-validation.test.ts` (the recording pool skips BEGIN/COMMIT).
- `backend/test/audit-writes.integration.test.ts` (new): changes every resource through the API and finds exactly one audit row per change by its `X-Request-Id`, and checks no memo text reaches the log.

## Verification

- `npm test -w backend`: unit tests pass. The audit integration test needs `TEST_DATABASE_URL`, so it ran in CI only.
- `npm run check`: see the PR.

## Limits

- Stored summaries are short by choice; the audit log is not a copy of the data.
- Changes made by the schedule catch-up on read (`moveOverdue`) are not audited here; #270 is moving that out of reads.
- Lane-2 files (`textbooks`, `textbook-contents`, `exercises`, `exercise-files`) got only the audit calls and the small transactions around them (LANES.md note).
