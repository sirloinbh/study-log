# Show search and retrospective lists only for the latest request (#279)

## Purpose

An older search answer could replace newer results, and a failed recent-retrospectives load showed "No retrospectives yet".

## Changes

| File                                   | Change                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `frontend/src/study-log-search.tsx`    | Every search takes a request number; answers (and errors) that are not for the latest one are dropped         |
| `frontend/src/retrospectives.tsx`      | A failed recent list shows an error with a "Retry loading the past retrospectives" button, not an empty list  |
| `frontend/src/latest-request.test.tsx` | Screen tests: a slow reload answered after a newer search is ignored; a failing list shows an error and retry |

## Verification

- `npm test -w frontend -- latest-request retrospectives`: 14 passed. The race test fails when the guard is removed.
- `npm run check`: see the PR.
