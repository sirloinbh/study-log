# #15 Understanding self-assessment, difficult parts, and goal achievement check

- Issue: [#15](https://github.com/sirloinbh/study-log/issues/15) (parent #9)
- Branch: `feat/15-study-reflection`
- Prerequisite: #10 study log DB and API (merged)

## Purpose

Leave the understanding right after studying and the parts you got stuck on, to use in retrospectives and reviews.

## Decisions

I recorded them in an issue comment: [#15 decisions](https://github.com/sirloinbh/study-log/issues/15#issuecomment-6335694653).

- Understanding: an integer from 1 to 5, optional. I did not adopt a 0 to 100% scale because entering it is slow and the spread is large.
- Difficult parts: free text, optional, 2000 characters or fewer.
- Goal achieved: not entered / achieved / not achieved. A study record has no separate goal field, so you mark yourself whether you reached that study's goal.
- A study record has no separate detail screen, so it is reflected in the input form and the recent records list.

## Changes

- `database/migrations/006_study_log_reflection.sql`
  - Added `understanding smallint`, `difficulties text NOT NULL DEFAULT ''`, and `goal_achieved boolean` to `study_logs`. NULL means not entered.
  - CHECK: `understanding BETWEEN 1 AND 5`, `length(difficulties) <= 2000`.
  - The constraints are added after checking `pg_constraint`, so it is safe to re-run.
- `backend/src/study-logs.ts`
  - Added `understanding` (an integer 1 to 5 or null), `difficulties` (2000 characters or fewer), and `goalAchieved` (boolean or null) to the input. All are optional.
  - Validation messages:
    - "이해도는 1~5 사이 정수로 입력하세요" ("Enter the understanding as an integer from 1 to 5")
    - "어려웠던 부분은 2000자 이하로 입력하세요" ("Enter the difficult parts in 2000 characters or fewer")
    - "어려웠던 부분 형식이 올바르지 않습니다" ("The format of the difficult parts is not valid")
    - "목표 달성 여부 형식이 올바르지 않습니다" ("The format of the goal achieved is not valid")
  - Added the three fields to the lookup and save responses. PUT replaces the whole record as before, so leaving a field out returns it to not entered.
- Screen (`frontend/src/StudyLogs.tsx`, `study-logs.ts`)
  - Added to the input form the understanding select (1 · barely know ... 5 · fully understand), the goal achieved select (achieved/not achieved), and the difficult parts input. The default of all is "not selected".
  - The recent records show "이해도 4/5 · 목표 미달성" ("Understanding 4/5 · Goal not achieved") and "어려웠던 부분: …" ("Difficult parts: …"). If there is no answer, the line is left out.
  - When editing, the values are filled in. When a new record is saved, they are cleared.

## Tests

- `backend/test/study-log-reflection.test.ts` (no DB)
  - Understanding that is out of range, a decimal, or a string, 2001 characters or a number for difficult parts, and a string for goal achieved -> a Korean 400. Both POST and PUT are checked.
  - It checks that not entered and the boundary values (1, 5, 2000 characters) are accepted and passed to the query as they are.
- `backend/test/study-log-reflection.integration.test.ts` (a real DB)
  - Save, list, and single lookup
  - An edit that clears (NULL, empty text)
  - DB CHECK (understanding 6 and 0, 2001 characters -> 23514)
- `backend/test/study-logs-ui.test.ts`
  - 3 new tests: input, save, list display and form reset, filling and clearing when editing, and the display function
  - I put the new fields into the existing body comparison. The lock cells went from 7 to 10.
- `backend/test/study-logs.integration.test.ts`: added the new fields to the response comparison.

## Verification

| Command             | Environment                                            | Result                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`     | Local, `TEST_DATABASE_URL` not set                     | exit 0. backend tests 86, pass 80, fail 0, **skipped 6** (DB integration), skills 4 pass, build passed                                                                               |
| Playwright 1440×900 | A real Express app + an in-memory fake pool, Vite 5202 | Entered understanding 4, not achieved, and difficult parts -> save -> list "이해도 4/5 · 목표 미달성", "어려웠던 부분: …", form reset, and values filled when editing. 0 page errors |
| Playwright 390×844  | The same environment                                   | No horizontal scroll (`scrollWidth` 375, the difference is the vertical scrollbar)                                                                                                   |

- The 6 skipped are DB integration tests (no local test DB). They run in CI (PostgreSQL 17), including the new integration tests.
- The fake pool in the browser check does not run SQL or CHECK. The DB integration tests cover that part.
- Screenshots: [PC 1440×900](assets/15-pc-1440x900.png), [mobile 390×844](assets/15-mobile-390x844.png).
  - That the sidebar appears from the middle in the PC full page capture is the result of capturing a fixed sidebar (same as the #11 record).

## Automated code review, round 1

A separate read-only review agent reviewed the issue #15 done criteria and the PR changes.

- Points confirmed to have no problem:
  - The INSERT and UPDATE parameter numbers ($1 to $11, $1 to $12) and the array order
  - The migration is safe to re-run, and CHECK does not fail on existing rows
  - Zod is stricter than the DB CHECK (it counts in UTF-16 units)
  - The conversion of optional values, form reset, and restoring on edit and cancel
  - No regression in existing behavior
  - The accuracy of the docs
- There were no high or medium comments. There is no issue to split off either.
- Comment (low): the comment of another function ("when you change the textbook, clear the chapter/section") had been pushed above the new function.
  - Applied: moved it back to its original place (no behavior change).
- Comment (low): the `pg_constraint` check looks only at the constraint name.
  - Kept: it is the same way as the 005 migration in #14, and the name is specific, so I left it for consistency.
- Note: there is no test that verifies re-running the migration. It is outside the issue's done criteria.
- Verification: after moving the comment, `npm run check` exit 0.

## Automated code review, round 2

A separate read-only review agent checked the first-round fix (1eabe8c) and the final files again. The review is limited to 2 rounds, so I do not do a third.

- Moving the comment is accurate with no behavior change.
- It was confirmed that the migration, parameter numbers, validation, screen conversion, tests, and docs match the code.
- There were no comments and no issue to split off.

## Limits and follow-up

- Statistics for understanding and goal achievement are handled in the statistics dashboard (#47, #48).
- The form got longer because of the added input fields. I will decide whether to collapse the retrospective fields after using it.
