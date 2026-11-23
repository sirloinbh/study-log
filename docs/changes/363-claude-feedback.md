# Claude feedback on exercise solutions (#363)

## Purpose

I could record that an attempt was wrong, but not get help understanding why. Now I can give Claude my solution (text or a photo) and ask for a hint, a grade or an explanation.

## Decision (user, on the issue)

Feedback (hint, grade, explanation) is stored per attempt from #356.

## Changes

| File                                                                                               | Change                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database/migrations/031_exercise_attempt_feedback.sql`                                            | `exercise_attempt_feedback`: mode, solution text, whether a photo was sent, feedback, model; deleted with its attempt                                                                          |
| `backend/src/exercise-feedback.ts` (new)                                                           | `Feedbacker` and `claudeFeedbacker` through `callClaude` (feature `feedback`), tagged material, photo as an image block                                                                        |
| `backend/src/exercise-feedback-routes.ts` (new)                                                    | `POST /api/exercise-attempts/:id/feedback`: JSON or multipart, 404 before the body is read, PNG/JPEG by magic bytes, 20 MB limit, shares the 3-call `claudeSlots` cap, aborts with the request |
| `backend/src/exercise-attempts.ts`, `app.ts`, `claude-usage.ts`, `openapi.ts`, `docs/openapi.json` | Attempts list carries their feedback; route mounted; `feedback` usage feature                                                                                                                  |
| `frontend/src/exercise-feedback.tsx` (new), `exercise-attempts.tsx`, `exercise.ts`                 | "Ask Claude" under each attempt: solution text or photo, Hint / Grade / Explanation, stored answers shown                                                                                      |
| tests                                                                                              | Claude call with a fake client, route validation and limits, cap, DB flow (CI only), the component                                                                                             |

## Choices

- The photo itself is not stored, only `has_image`; the text solution is.
- Over-limit or non-image files are refused before Claude is called.
- Migration 031 is the next free number; renumber on a clash at merge.

## Verification

See the PR. Not opened in a real browser at 390x844 and 1440x900 (no local database or API key).
