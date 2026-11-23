# Record exercise attempts: backend (#356)

## Purpose

Exercises stored only the problem and answer, so there was no way to tell which ones I struggle with. This is the backend half of #356; the exercise screen part follows after #346 merges (lane-4 is changing those screens).

## Changes

| File                                                                | Change                                                                                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `database/migrations/023_exercise_attempts.sql`                     | `exercise_attempts` (exercise, date, `result` correct/wrong, `hint_used`, note), deleted with its exercise                                      |
| `backend/src/exercise-attempts.ts` (new)                            | `GET`/`POST /api/exercises/:id/attempts` (newest first; date defaults to today) and `DELETE /api/exercise-attempts/:id`, Zod-validated, audited |
| `backend/src/app.ts`, `backend/src/openapi.ts`, `docs/openapi.json` | Route mounting (two lines) and the operation table; the document is regenerated                                                                 |
| `backend/test/exercise-attempts*.test.ts`                           | Validation messages, default date, newest-first list, delete, cascade with the exercise (DB test, CI only)                                      |

## Choices

- `result` is `correct` or `wrong` and `hint_used` is a separate flag, as the card lists them. "Wrong" for #357 is: latest attempt wrong or hint used.
- The latest attempt is the highest date, then the highest id.
- Migration number 023 is the next free one now; renumber on a clash at merge.

## Verification

See the PR.
