# List the exercises I got wrong (#357)

## Purpose

After #356 there were attempt records but no single place to see the exercises I still get wrong.

## Rule (user decision 2026-11-23, issue comment)

An exercise is listed while its **latest attempt** (highest date, then highest id) is wrong or was solved with a hint. A clean correct attempt takes it off the list, and a later wrong or hinted attempt puts it back.

## Changes

| File                                                                            | Change                                                                                                                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/exercise-attempts.ts`, `app.ts`, `openapi.ts`, `docs/openapi.json` | `GET /api/exercises/wrong?textbookId=&contentId=`: across textbooks, newest attempt first, with textbook and chapter titles (mounted before the `/:id` routes) |
| `frontend/src/wrong-exercises.tsx` (new), `exercise.ts`, `app.tsx`              | A "Wrong problems" page (menu entry, `/wrong-exercises`) with a textbook filter                                                                                |
| tests                                                                           | Filter validation, route order, the rule with DB data (CI only), screen and menu tests                                                                         |

## Choices

- The screen filters by textbook; the API also takes `contentId` (that chapter or section's own exercises, not its sub-sections).
- A new menu entry "Wrong problems" (one nav line and one route in `app.tsx`).

## Verification

See the PR. Not opened in a real browser at 390x844 and 1440x900 (no local database).
