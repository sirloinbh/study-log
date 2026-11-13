# #10 Study log DB and API (automatic time calculation)

- Issue: [#10](https://github.com/sirloinbh/study-log/issues/10) (parent #9)
- Branch: `feat/10-study-log-api`
- Migration number: `002` reserved and used

## Purpose

Build the core data structure that stores what you studied and for how long. The statistics, review, and schedule features are based on this record.

## Decisions (confirmed with the user, [issue comment](https://github.com/sirloinbh/study-log/issues/10#issuecomment-6315555771))

- A record that crosses midnight (23:00 to 01:00) is treated as study of the date it started, and the whole time (120 minutes) is attributed to that date.
- The input is the study date + start and end times (HH:MM). If the end is earlier than the start, it is calculated as the next day, and if they are the same, it is rejected.

## Changes

- `database/migrations/002_study_logs.sql`: `study_logs` (study date, start and end times, study time in minutes 1 to 1439, note, status `planned`/`in_progress`/`done`/`stopped`). It is safe to re-run with `IF NOT EXISTS`. The status values are English codes, so there are no Korean literals.
- `backend/src/study-logs.ts`: the `studyMinutes()` calculation and the router.
  - `GET /api/study-logs?date=YYYY-MM-DD`: that day's records in start time order. Without `date`, the recent records (`limit` default 20, at most 100).
  - `GET /api/study-logs/:id`, `POST /api/study-logs` (201), `PUT /api/study-logs/:id` (a full edit), `DELETE /api/study-logs/:id` (204). A missing ID gives 404 `학습 기록을 찾을 수 없습니다` ("Study log not found").
  - All Zod validation messages are in Korean (format, a date that does not exist, HH:MM, start = end, status, note 10000 characters).
- `backend/src/app.ts`: registered the `/api/study-logs` router.
- `backend/test/helpers.ts`: with `call(path, { method, body })`, it supports requests other than GET and a 204 response (the existing way of calling is kept).

## Tests

- `backend/test/study-logs.test.ts` (unit, fake pool): the time calculation, a midnight crossing of 120 minutes and 1 minute, 8 kinds of wrong input rejected with a Korean 400 before the DB lookup, wrong lookup conditions and IDs, and 404 for lookup, edit, and delete of a missing record.
- `backend/test/study-logs.integration.test.ts` (a real DB): creation (a midnight crossing of 120 minutes, the default status and note), lookup by date in time order, the recent list, recalculating time after an edit, and 404 after a delete. It cleans up only the rows of the dedicated date (2099-01-15).

## Verification

| Command                                           | Environment                        | Result                                                                                                                   |
| ------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                                   | Local, `TEST_DATABASE_URL` not set | exit 0. backend tests 14, pass 12, fail 0, skipped 2 (2 DB integration), skills 4 pass, build passed                     |
| GitHub Actions `verify` (PR #55, run 39600302004) | Postgres 17 + migrations applied   | pass: backend tests 14, pass 14, skipped 0 (the 2 DB integration tests actually ran), skills 4 pass. `docker-build` pass |

## Limits and follow-up

- There is no Docker or PostgreSQL locally, so the DB integration tests and applying the migration were checked only in CI.
- The problem that the test helper fails intermittently when it gets a port that fetch forbids was found while working on #12, and I registered it as #56.
- The screen is added in #11, the textbook and chapter link in #14, and the self-assessment fields in #15.

## Automated code review, round 1 (PR #55)

After merging `origin/main` (#54, #2, #4) into this branch, a separate read-only review agent reviewed the whole PR diff. There were no defects in the time calculation, midnight crossing, SQL parameterization, or the migration SQL. I applied all the comments below in this PR, and no issue was split off.

- Comment (medium): a POST or PUT request with no body or an array body answered 400 with Zod's default English messages ("Required", "Expected object, received array").
  - Applied: I gave the `studyLogInput` object schema Korean `required_error` and `invalid_type_error` ("학습 기록 내용을 JSON 객체로 보내세요", "Send the study log content as a JSON object").
- Comment (low): the ID validation was `z.coerce.number()`, so it accepted `1e3`, `0x10`, and 20-digit numbers. A 20-digit number became a 500 from the Postgres bigint range error.
  - Applied: it now accepts only positive integers of 1 to 15 digits with no leading zero.
- Comment (low): broken JSON or a body over 256kb was answered with a 500 "server error".
  - Applied: in the `app.ts` error handling, `entity.parse.failed` answers 400 "요청 본문의 JSON 형식이 올바르지 않습니다" ("The JSON format of the request body is not valid"), and `entity.too.large` answers 413 "요청 본문이 너무 큽니다" ("The request body is too large").
- Comment (low): the "migration safe to re-run" done criterion was not actually verified.
  - Applied: CI applies `database/migrations/*.sql` twice in a row.
- Tests (`backend/test/study-logs.test.ts`): I added tests for a body that is not an object, broken JSON, a JSON string, and an oversize body, and tests for 7 kinds of abnormal IDs × lookup, edit, and delete. I added `rawBody` to `backend/test/helpers.ts` for sending a raw body.
  - When run with the source before the fix, 2 new tests fail, and after the fix they pass.
- Verification after the fix: local `npm run check` exit 0. backend tests 16, pass 14, fail 0, skipped 2 (2 DB integration, `TEST_DATABASE_URL` not set). Skills 4 pass, build passed. The DB integration tests and applying the migration twice are checked in CI.

## Automated code review, round 2 (PR #55)

- Checked the first-round fixes: the body schema messages, the ID regular expression, the 400 and 413 handling, and applying the migration twice in CI work as intended. The conflict with #57 is only a text conflict in `helpers.ts`.
- Comment (low): other body-parser 4xx errors were still answered with 500. Examples: `charset=latin1` -> `charset.unsupported`, an unsupported `Content-Encoding` -> `encoding.unsupported`, and an aborted request.
  - Applied: in the `app.ts` error handling, an error whose `status` is 400 to 499 is answered with that status code and "요청을 처리할 수 없습니다" ("The request cannot be handled").
  - Tests: I added to `study-logs.test.ts` a check that a `charset=latin1` request is answered with 415. I added a `contentType` option to `helpers.ts`.
- The review is limited to 2 rounds, so I do not do a third. The merge is decided by the CI of the final head.
- Verification after the fix: local `npm run check` exit 0. backend tests 16, pass 14, fail 0, skipped 2 (2 DB integration, `TEST_DATABASE_URL` not set). Skills 4 pass, build passed. The DB integration tests and applying the migration twice are checked in CI.
