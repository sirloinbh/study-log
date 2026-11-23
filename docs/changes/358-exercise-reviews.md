# Bring wrong exercises back for review on set days (#358)

## Purpose

Reviews existed only per study log, so a wrong exercise was never scheduled again.

## Rule (user decision 2026-11-23, issue comment; now `docs/decisions/review-rules.md` chapter 7)

After a wrong or hinted attempt the exercise is due in 1, 3, 7, then 14 days. A clean correct retry moves it to the next step, finishing step 4 ends the cycle, and a wrong or hinted retry restarts at 1 day. They show in today's review list and the badge.

## Changes

| File                                                                                    | Change                                                                                                                                          |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `database/migrations/030_exercise_reviews.sql`                                          | `exercise_reviews`: one row per exercise while its cycle runs (step 1-4, due date), deleted with the exercise                                   |
| `backend/src/exercise-reviews.ts` (new)                                                 | The step rule (`nextExerciseReview`), applying it in the attempt's transaction, and the list and count queries                                  |
| `backend/src/exercise-attempts.ts`                                                      | Saving an attempt updates the review in the same transaction                                                                                    |
| `backend/src/reviews.ts` (single spot), `openapi.ts`, `docs/openapi.json`               | The three list routes also return `exerciseReviews`; the badge count adds them                                                                  |
| `frontend/src/exercise-review-list.tsx` (new), `review.ts`, `reviews.tsx` (single spot) | "Problems to practise again" in the Reviews page: Solved, Solved with a hint, Wrong record an attempt right there and reload the list and badge |
| `docs/decisions/review-rules.md`                                                        | New chapter 7                                                                                                                                   |
| tests                                                                                   | The step rule (unit), the whole cycle through the API (DB test, CI only), the list component, the Reviews page with only exercise reviews       |

## Choices

- Days are counted from the date of the attempt that sets the step (a wrong attempt on day 0 makes step 1 due on day 1; a clean correct one on day 1 makes step 2 due on day 4).
- Deleting an attempt does not recalculate the cycle; exercise reviews are not postponed by hand and are not in the completion-rate statistics.
- Migration number 030 is the next free one; renumber on a clash at merge.

## Verification

See the PR. Not opened in a real browser at 390x844 and 1440x900 (no local database).
