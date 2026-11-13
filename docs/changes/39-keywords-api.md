# #39 Today's keyword DB and API

- Issue: [#39](https://github.com/sirloinbh/study-log/issues/39) (parent #6)
- Branch: `feat/39-keywords-api`
- Prerequisite: none

## Purpose

Store important keywords from studying by date, and view them by date or search them. The screen is in the scope of #40.

## Decisions

I implemented the rules the issue did not set by the criteria below. I also left them in an [issue comment](https://github.com/sirloinbh/study-log/issues/39#issuecomment-6355484438).

- Keep only one of the same keyword on the same date. Ones that differ only by case count as the same keyword.
- Search is a partial match on the keyword and note, and is case-insensitive. You can also specify a period.
- If you leave the date empty, it is saved as today based on `serviceDate()`.
- Length: keyword 50 characters (one line), note 2000 characters.

## Changes

- `database/migrations/009_keywords.sql`: the `keywords` table.
  - Columns: the date (`keyword_date`), the keyword, and the note (default empty).
  - CHECK: the keyword is 1 to 50 characters with no leading or trailing spaces, and the note is 2000 characters or fewer.
  - A unique index `(keyword_date, lower(keyword))`: it blocks the same keyword (ignoring case) on the same date. It is also used for lookup by date.
- `backend/src/keywords.ts`, `backend/src/app.ts`, `backend/src/study-logs.ts` (export `isCalendarDate`)

  | Request                                 | Behavior                                                                                            |
  | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
  | `GET /api/keywords?date=YYYY-MM-DD`     | That day's keywords in the order they were added                                                    |
  | `GET /api/keywords?q=&from=&to=&limit=` | Most recent date first. `q` is a partial match on keyword and note. `limit` default 50, at most 200 |
  | `GET /api/keywords/:id`                 | One                                                                                                 |
  | `POST /api/keywords`                    | `{ date?, keyword, memo? }`. 201 `{ keyword }`                                                      |
  | `PUT /api/keywords/:id`                 | Replace the date, keyword, and note. If you empty the date, it is today. 200                        |
  | `DELETE /api/keywords/:id`              | 204                                                                                                 |
  - Response fields: `id`, `date`, `keyword`, `memo`.
  - If you give `date`, it looks up only that day and does not apply `q`, `from`, `to`, and `limit`.
  - `%`, `_`, and `\` in the search term are searched as those characters, not wildcards.
  - Duplicate: "이 날짜에 이미 있는 키워드입니다" ("This keyword already exists on this date") 409 (both add and edit). A missing keyword: "키워드를 찾을 수 없습니다" ("Keyword not found") 404.
  - Validation messages: keyword input, format, 50 characters, one line, note 2000 characters, date format and a date that does not exist, search term 50 characters, start date > end date, the lookup count, JSON object, and ID.

## Tests

- `backend/test/keywords.test.ts` (no DB)
  - A wrong body -> a Korean 400. Both POST and PUT are checked
  - Validation of list conditions and ID
  - 404 for a missing keyword, and 409 for a duplicate (add and edit)
  - If the date is empty, it is saved as the injected today (`2026-10-23`), and the keyword trim
  - Escaping `%`, `_`, and `\` in the search term
- `backend/test/keywords.integration.test.ts` (a real DB)
  - The default of today, and the lookup order by date
  - A duplicate on the same date (including case) is 409, and a different date is allowed
  - Searching keyword and note, ignoring case, searching `50%` and `%` as literal characters, the period filter, and most recent date first
  - Edit, a duplicate caused by an edit is 409, and 404 after a delete
  - DB CHECK: an empty keyword, a leading space, and a 51-character keyword give 23514

## Verification

| Command                                                    | Environment                                                      | Result                                                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                            | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 134, pass 124, fail 0, skipped 10 (DB) (the same when run again after the first-review fixes) |
| `tsx --test --test-concurrency=1 test/*.test.ts` (backend) | Local Docker `postgres:17-alpine`, migrations 001 to 009 applied | tests 134, pass 134, fail 0, skipped 0                                                                              |

- I applied 009 twice to the same DB and confirmed it is safe to re-run.
- The reason I ran it serially is #76 (an unrelated parallel run race).
- There was no screen change, so I did not check in a browser. It is not in the issue's done criteria either.

## Automated code review, round 1

A separate read-only review agent reviewed the issue #39 done criteria and the PR changes. There were no high or medium comments. There is no issue to split off either.

- Points confirmed to have no problem: the parameter binding of the dynamic WHERE, the LIKE escape, the unique index and the 23505 -> 409 mapping, consistency between Zod trim and the DB CHECK, date and time zone handling, re-running the migration, and the docs matching.
- low (applied): `0000-01-01` is valid as a JS date, but PostgreSQL has no year 0, so it became a DB error 500. Study logs had the same problem.
  - I made the shared `isCalendarDate` reject dates before 0001-01-01. It applies to study logs too.
  - I added cases to the keyword body and lookup tests and to the study log tests. I confirmed 3 fail before the fix and pass after the fix.
- low (applied): I wrote in the docs that if you give `date`, the other conditions are ignored, and fixed it with an integration test.
- low (kept)
  - An edit with an empty date moves it to today. It is the same rule as add and is in the docs.
  - The one-line rule looks only at CR and LF. The Unicode line separators (U+2028/2029) hardly ever occur in real input.

## Automated code review, round 2

A separate read-only review agent checked the first-round fixes and the whole final PR again. The review is limited to 2 rounds, so I do not do a third.

- Rejecting the year 0000 is a string comparison after the regular expression check, so it is the same as numeric order. Both places that call it go through the regular expression first. The only value newly rejected in study logs is the year 0000, which was a 500 before, so there is no regression.
- There were no code comments and no issue to split off.
- Note: a NUL character in a keyword, note, or search term becomes a 500. It is fixed together in the existing #58 (common to all APIs).

## Limits and follow-up

- The screen (quick input, list by date, search) is #40.
- Keywords are not linked to textbooks or study logs.
- The 500 for a NUL character in a string (#58) applies to this API too.
