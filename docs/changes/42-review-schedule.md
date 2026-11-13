# #42 Review schedule DB and automatic creation when studying is completed

- Issue: [#42](https://github.com/sirloinbh/study-log/issues/42)
- Branch: `feat/42-review-schedule`
- Rules: [review interval rules](../decisions/review-rules.md)

## Purpose

When a study record is completed, register review round 1 automatically. From round 2, the completion handling in #43 creates them.

## Changes

- `database/migrations/012_reviews.sql`: the per-round review table `reviews`. The combination of record and round is unique, and when a record is deleted they are deleted with it. `completed_on` is the completion record, and `original_due_date` is the basis for counting lateness that does not change even when postponed (#46).
- `backend/src/reviews.ts`: due date calculation for the intervals 1, 2, 4, 7, and 16 days, and round 1 synchronization.
- `backend/src/study-logs.ts`: wrapped registration and editing in a transaction. An edit locks the row and compares with the previous state.
- `backend/src/sql.ts`: moved the transaction function `inTransaction` from `textbook-contents.ts` and shared it. The behavior of discarding the connection when a rollback fails (#68) is unchanged.

## Behavior

| Before saving -> after saving              | Result                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| None or incomplete -> completed            | Create round 1. If it already exists, leave it                                      |
| Completed -> incomplete                    | Delete the round 1 that is not completed. If a round is completed, leave it         |
| Completed -> completed, study date changed | Recalculate the due date and original due date of the round 1 that is not completed |
| Completed -> completed, other edits        | No change. Not applied retroactively to records completed before the feature        |

## Decisions

A study date is accepted up to 9999-12-31, so if a due date would go past that, I set it to 9999-12-31. If this boundary is not handled, the date leaves the `YYYY-MM-DD` format and saving fails.

## Tests

- `backend/test/reviews.test.ts`: round dates, a late completion, month, year, and leap day boundaries, and the last date. It checks with a fake DB that when saving the review fails, it does ROLLBACK and returns the connection.
- `backend/test/reviews.integration.test.ts`: creation, preventing duplicates (concurrent saves), waiting on the row lock, un-completing, changing the study date, keeping postponed dates and completed rounds, no retroactive creation, deletion, a missing reference, and 404.
- `backend/test/study-logs.test.ts`, `backend/test/study-log-reflection.test.ts`: changed the fake DB to use the transaction connection.

## Review

In the first review there were no rule violations in the production code, and I fixed 4 test gaps and 2 document points in this PR.

- The rollback test failed before saving the review, so it could not verify the transaction. I added a test where saving the review fails.
- It did not verify keeping the postponed date when a note is edited, keeping the completed round 1 when the study date changes, or waiting on the row lock. I added a test for each.
- I matched the test description in the change record to the real scope, and wrote the 9999-12-31 handling in the rules document.

I split existing problems beyond the scope into new issues.

- [#133](https://github.com/sirloinbh/study-log/issues/133): if the DB connection drops, the API process can die.
- [#134](https://github.com/sirloinbh/study-log/issues/134): the deployment script runs a `dist/migrate.js` that does not exist. So 012 must be applied with the manual procedure in `database/README.md`.

The second review had nothing to fix.

## Verification

- I applied migration 012 to the test DB twice, and it succeeded both times.
- With `TEST_DATABASE_URL` set, I ran the format, lint, type check, and tests of `npm run check`. Backend 280, frontend 52, and skills 4 all passed (0 skipped).
- `npm run build` and `npm run standards:check` passed.
- There was no screen change, so I did not check in a browser.
