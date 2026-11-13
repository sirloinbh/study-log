# #67 Mismatch between the ID validation range (15 digits) and the response conversion (::int)

- Issue: [#67](https://github.com/sirloinbh/study-log/issues/67) (split from the PR #66 review)
- Branch: `fix/67-bigint-ids`

## Problem

The ID validation for paths and bodies in the API accepts positive integers up to 15 digits (at most 999,999,999,999,999). But the lookup results were converted with `id::int`. So when a row ID went over 2,147,483,647, it gave a 500 with "integer out of range". All the ID columns of the tables are `bigint`.

## Decision

Of the two methods the issue offered, I unified on **fitting the response to the bigint range**.

- If you lower the validation limit to the int range, the range stays out of step with the bigint columns. It would also need fixing the validation in several modules.
- Integers of 15 digits or fewer are represented exactly as JS numbers (below 2^53). So keeping the response as numbers does not change the API format.

## Changes

- `backend/src/app.ts`: register a pg `bigint` (int8, OID 20) parser that reads it as a JS number.
  - It is the same way as the DATE parser.
  - A value that cannot be represented exactly (2^53 or more) is rejected as an error instead of being rounded. You cannot make such an ID through the API.
- Removed 10 `::int` conversions.
  - Target files: `exercises.ts`, `keywords.ts`, `study-logs.ts`, `textbook-contents.ts`, `textbooks.ts`
  - The response field names and number format are unchanged.
- The app code has no aggregate that returns bigint (`count` and so on). So the parser affects only IDs. All `count(*)` in the test code are written with `::int`.

## Tests

- `backend/test/bigint-ids.integration.test.ts` (a real DB, a new file)
  - Insert the IDs 3,000,000,000 (over the int range) and 999,999,999,999,999 (the 15-digit maximum) directly with `OVERRIDING SYSTEM VALUE`.
  - Check that the IDs in the responses are exact numbers.
    - Textbook lookup, table of contents lookup
    - Adding a section under it (`parentId`)
    - Exercise lookup, saving an answer (`exerciseId`)
    - Adding a study log (`textbookId` and `contentId`)
    - Keyword lookup
- I confirmed that it fails from the first check (looking up the textbook 3,000,000,000) on the code before the fix, and passes after the fix.

## Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 157, pass 145, fail 0, skipped 12 (DB) |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 009 applied | exit 0. tests 157, pass 157, fail 0, skipped 0               |

- There was no screen change, so I did not check in a browser.

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no comments, so I do not do a second review. There is no issue to split off either.

- Confirmed points
  - ID comparisons (the `Set` in reordering the table of contents, the `Map` in building the tree) are all number to number as they are.
  - Even after removing `::int AS id`, there is no ambiguous `id` in join queries.
  - If the parser rejects a value of 2^53 or more, pg turns the query into a failure and it becomes a normal 500. The process does not stop.
  - There is no place in the app or tests that wrongly reads another bigint value (`count` and so on) as a number.
- Note (kept): reordering the table of contents and the list API were not tested separately with large IDs. It is the same code path.

## Limits and follow-up

- The bigint parser applies to the whole pg module. If you add a bigint aggregate later (for example a large sum), that value will be read as a number too. If it can exceed 2^53, it must be handled separately.
