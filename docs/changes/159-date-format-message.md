# #159 Stop the "date does not exist" message from appearing together with a wrongly formatted date

- Issue: [#159](https://github.com/sirloinbh/study-log/issues/159)
- Branch: `chore/159-date-format-message`

## Purpose

When a date's format was wrong, "존재하지 않는 날짜입니다" ("This date does not exist") came out together with the format error. Example: `2026/11/02` -> `예정일은 YYYY-MM-DD 형식으로 입력하세요, 존재하지 않는 날짜입니다` ("Enter the due date in YYYY-MM-DD format, this date does not exist"). This is because zod 4 runs the later `refine` even if the earlier `regex` check fails. It was a comment in the second review of PR #158.

## Changes

- `backend/src/dates.ts`: added the shared date schema `calendarDate(text, formatMessage)`. `text` is a `z.string(...)` that carries the message for when it is missing or the type is wrong, and after it come the `YYYY-MM-DD` format check and the real date check. I gave both checks zod 4's `abort: true`, so if one fails, the later checks are not run. I first confirmed that on zod 4.6.7 this option stops the later `refine`.
- I changed 7 date schema definitions in the following 6 modules (`dateField` is used three times, so 9 date schemas) to this function. The message each field gives is unchanged.
  - `keywords.ts`: the keyword date
  - `retrospectives.ts`: the retrospective date
  - `reviews.ts`: the due date
  - `schedules.ts`: the start date, the end date, and the move date
  - `stats.ts`: the start date and end date of the pattern lookup
  - `study-logs.ts`: the study date
- The retrospective date has a 1900 to 9998 range check after the real date check. Now `0000-01-01` gives only "존재하지 않는 날짜입니다" and the range message does not come with it. The range check when the format or date is right is unchanged.
- If the date is wrong, object-level checks are not run either. It is the same as what already happened for a missing field or a wrong type. The targets are the check of whether `from` is later than `to` (keywords, statistics, study logs), the comparison of the start and end times of a study log and the check of a table of contents entry with no textbook, and the schedule's period check (`superRefine`). The response changes only for keywords, statistics, and study logs. For schedules, the guard on the first line of `superRefine` already returned first on a wrong date, so the response is the same. Example: for `from=2026-02-30&to=2026-01-01`, a date that does not exist, it used to be `존재하지 않는 날짜입니다, 시작일은 종료일보다 늦을 수 없습니다` ("This date does not exist, the start date cannot be later than the end date"), and now only the first message comes out. A result compared with a date that does not exist is meaningless, so I judged the fixed way to be right. The messages of each check on the other fields still come together, and the response for a request with right dates does not change. I fixed the related comment in `schedules.ts` to match.
- `docs/next-steps/README.md`: removed the finished #159 from the candidates. I wrote the user's decision (#177) to prepare the test DB as a Docker container.

## Tests

- `backend/test/date-format.test.ts` (a new file): calls the API without a DB and compares the response message exactly.
  - 12 wrongly formatted dates: requests that pass through all 7 changed schema definitions. The `?date` and `?to` of keywords and study logs and the edit (PUT) body use the same schema, so I did not call them separately. Only one format message must appear.
  - 6 dates that do not exist: one per module. Only "존재하지 않는 날짜입니다" must appear. It includes `0000-01-01` for the retrospective.
  - When I ran it before the fix, it failed on the first case with `날짜는 YYYY-MM-DD 형식으로 입력하세요, 존재하지 않는 날짜입니다`. It is one loop and stops at the first failure, so I did not separately confirm the failures of the other cases. The reviewer reproduced the same result separately in the first review. After the fix, all pass.
- `backend/test/review-adjust.integration.test.ts`: changed the expected value that had fixed the two messages overlapping to `예정일은 YYYY-MM-DD 형식으로 입력하세요`. It is a DB integration test, so I could not run it this time (see Verification below).

## Verification

- `npm test -w backend`: of 324, 291 passed, 0 failed, 33 skipped.
- The 33 skipped are DB integration tests. I could not run them because there is no `TEST_DATABASE_URL` (#177, #178). So I could not confirm by running the fixed expected value in `review-adjust.integration.test.ts` either. `date-format.test.ts` checks the same due date check without a DB.
- `npm run check`: passed (exit 0). Of 324 backend tests, 291 passed, 0 failed, 33 skipped (the DB integration tests above). Frontend 32 files, 214 passed, 2 skipped (the dark-only app tests from the central standards). 4 skill tests passed.

## Review

The first review found no defects that had to be fixed. I confirmed that `abort: true` of zod 4.6.7 stops only the later checks and the object-level checks of the same schema and still gives the messages of other fields, that the response for a request with right dates did not change, that no date field was missed (`holidays.ts` is not user input, and the month in `calendar.ts` is only one regular expression), and that the new tests fail on the code before the fix. I fixed the following in this PR.

- I wrote in "Changes" that if the date is wrong, the message of object-level checks drops out too.
- I corrected "8 date schemas" to "7 definitions (9 fields)".
- I matched the wording of the test scope and the failure check before the fix to the facts.
- The `superRefine` comment in `schedules.ts` was not right for a date error, so I fixed it. The behavior is the same.

In the second review I confirmed that the four first-round comments were applied exactly and that there are no code defects in the whole diff (the reviewer's run of `npm test -w backend`: 291 passed, 0 failed, 33 skipped). I fixed two document comments. The review is limited to 2 rounds, so there is no further review.

- I wrote that the response changes through object-level checks only for keywords, statistics, and study logs, and that for schedules it is the same because the guard already returned first.
- I changed "9 fields" to "9 date schemas" so it is not confused with the number of uses.
