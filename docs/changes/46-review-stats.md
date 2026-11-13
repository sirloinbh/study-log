# #46 Review completion rate statistics API

- Issue: [#46](https://github.com/sirloinbh/study-log/issues/46)
- Branch: `feat/46-review-stats`
- Rules: chapter 5 of the [review interval rules](../decisions/review-rules.md)

## Purpose

Provide a number for how well the reviews were kept. The screen is built in #52.

## Changes

- `backend/src/stats.ts`: `GET /api/stats/reviews?period=week|month|3months|all`. The default is this week. It returns the due, completed, and late counts and the completion rate as a whole percent.
- `docs/decisions/review-rules.md`: wrote the counting criteria in chapter 5.
- `docs/next-steps/README.md`: changed the next candidate to #52.

## User decisions (2026-11-01)

- The period is based on the original due date.
- Late means a late completion or a past incomplete round.
- The completion rate is completed ÷ due, and there is none when due is 0.

## Finding

`Date.UTC` in `periodStart` reads years 0 to 99 as the 1900s. The period is computed from today's date, so this does not happen in the real service and I did not fix it, and the test uses the year 100.

## Review

The first review found no defects in the code or the tests. The definition of late in the rules document differed between chapters 3 and 5, and the exception for fixing the study date was missing, so I fixed those. The second review found nothing to fix.

## Verification

`npm run check` with `TEST_DATABASE_URL` set passed. Backend 335, frontend 112, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards. There was no screen change, so I did not check in a browser.

## Tests

- `backend/test/stats.test.ts`: the completion rate calculation and rounding, due 0.
- `backend/test/review-stats.integration.test.ts`: sample calculations for the 4 periods, on-time, late, and early completion, a past incomplete round, due today, excluding the future, no change when dates are moved, the default period, 400. It compares whole totals, so the order is aligned with other tests of early dates by a DB lock.
