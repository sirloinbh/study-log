# #260 Use the synced standard/http.ts error handler and id parser

Issue: https://github.com/sirloinbh/study-log/issues/260

## Purpose

`app.ts` kept its own 404, error handler and `serviceDate`, and every route file wrote the same id schema. The synced `standard/http.ts` has all of them, with Zod issues capped at `MAX_ISSUES` and a 500 log line that has `requestId`, `time` and `level`.

## Changes

- `backend/src/app.ts`: uses `notFound`, `errorHandler` and `serviceDate` from `standard/http.ts`; the inline 404, the inline error handler, and the local `serviceDate` are gone. The NUL (`22021`) and duplicate (`23505`) branches are already in the standard handler.
- Path id schemas replaced by `parseId(value, label)` in `keywords`, `reviews`, `study-logs`, `schedules` (also the item id), `textbooks`, `textbook-contents`, `exercises` and `exercise-files`. Messages stay `Invalid <label> ID`. Body and query id schemas (`bodyId`, `?textbookId`, `?contentId`) are unchanged: `parseId` reads path strings only.
- `backend/test/health.test.ts`: imports `serviceDate` from `standard/http.ts`; new tests for the 500 log fields, a malformed path id, and the capped validation message.

## Behavior notes

- Validation errors in the standard handler also cover PG input errors (`23503`, `23514`, `22P02`, `22007`, `22008`) as 400 instead of a logged 500.
- `textbooks.ts` keeps its `{ status, body }` reply objects: they run inside `inTransaction`'s rollback predicate (`reply.status < 400`), so `HttpError` would not remove code there. Left as is.
- Lane-2 files (`textbooks`, `textbook-contents`, `exercises`, `exercise-files`) got only the id-schema hunks (LANES.md note).

## Verification

- `backend/test/health.test.ts`: 7 pass.
- The issue asks for 5,000 invalid items, but the bulk route accepts at most 200, so the test sends 200 (still far above the 10-issue cap) and checks the message ends with `and N more`.
- `npm run check`: see the PR.
