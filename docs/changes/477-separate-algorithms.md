# 477: Separate algorithm problem solving from the day study log

Part of epic #468.

## What changed

- The Study log page (`study-logs.tsx`) no longer renders `CodingGoalDay`; it shows nothing about algorithm problems.
- The Algorithms page (`/coding`, `coding-problems.tsx`) now shows the today's-goal block (`CodingGoalDay`) at the top, above the quick log (`CodingQuickLog`, which was already on that page).
- The menu item, page title and description in `app.tsx` say "Algorithms". The `/coding` address is unchanged, so old links keep working.

## Check: a coding solve is not counted as a study log

- `study_logs` and `coding_problems` / `coding_attempts` are separate tables, and the dashboard totals read `study_logs` only. This PR changes no backend code, so totals do not change.
- Existing behavior, left as is: the attempt form has an opt-in switch ("log" with a start time, #368) that also creates a study log for that attempt. The quick log does not use it. Nothing is counted as a study log unless the user turns that switch on.

## Tests

- `screens.test.tsx`: the Study log page shows no goal block and makes no `/api/coding` request.
- `coding-goal-progress.test.tsx`: the Algorithms page shows the goal block above the quick log; the goal block tests were renamed.
- `e2e/coding-goal-progress.spec.ts`: the goal block is checked on `/coding` instead of `/`. `coding-quick-log.spec.ts` already runs on `/coding` and needs no change.
