# Record exercise attempts (#356)

## Purpose

Exercises stored only the problem and answer, so there was no way to tell which ones I struggle with. The backend came first; the exercise screen part was added after #346 merged.

## Changes

| File                                                                                    | Change                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database/migrations/023_exercise_attempts.sql`                                         | `exercise_attempts` (exercise, date, `result` correct/wrong, `hint_used`, note), deleted with its exercise                                                                                                  |
| `backend/src/exercise-attempts.ts` (new)                                                | `GET`/`POST /api/exercises/:id/attempts` (newest first; date defaults to today) and `DELETE /api/exercise-attempts/:id`, Zod-validated, audited                                                             |
| `backend/src/app.ts`, `backend/src/openapi.ts`, `docs/openapi.json`                     | Route mounting (two lines) and the operation table; the document is regenerated                                                                                                                             |
| `backend/test/exercise-attempts*.test.ts`                                               | Validation messages, default date, newest-first list, delete, cascade with the exercise (DB test, CI only)                                                                                                  |
| `frontend/src/exercise-attempts.tsx` (new), `exercise.ts`, `exercises.tsx`, `style.css` | An "Attempts" panel under each exercise: "I used a hint" checkbox, Correct and Wrong buttons, the history newest first, delete with the shared confirm dialog. The list loads only when the panel is opened |
| `frontend/src/exercise-attempts.test.tsx` (new), `exercises.test.tsx`                   | Lazy load, recording with the hint flag, delete asks first, failed record is announced; the button-name list gains "show attempts"                                                                          |

## Choices

- `result` is `correct` or `wrong` and `hint_used` is a separate flag, as the card lists them. "Wrong" for #357 is: latest attempt wrong or hint used.
- The latest attempt is the highest date, then the highest id.
- Migration number 023 is the next free one now; renumber on a clash at merge.

## Verification

See the PR. The screen was not opened in a real browser at 390x844 and 1440x900 (no local database to run the app); the Vitest screen tests and CI e2e cover it.
