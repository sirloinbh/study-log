# #426 Show progress on each algorithm goal list

- Issue: [#426](https://github.com/sirloinbh/study-log/issues/426) (parent #423)
- Branch: `feat/426-goal-progress`
- Builds on #425 (goal lists) and #427 (quick log).

## Counting rules

- An item is **solved** when its problem has a solved attempt, whenever it was made. A problem solved before the list was imported counts at once, and a later failed attempt does not undo it. A partly solved attempt does not count. The solved day is the day of the latest solved attempt.
- An unsolved item is **late** when its due day has passed. The due day is the item's own target date, else the list's target date; an item with neither is never late (the sample file has no target dates, so its progress is just solved of total).
- **This week** is Sunday to Saturday, like the other weekly figures: items due this week and how many of them are solved.
- The **next** problems of a list are its first unsolved items in the file's order.

## Changes

- `backend/src/coding-goal-progress.ts` (pure): `stateOf`, `progressOf`.
- `backend/src/coding-goals.ts`: `GET /api/coding/goals` now returns each list's progress and next problems; `GET /api/coding/goals/:id` returns the progress and every item with its state, attempts and solved day; new `GET /api/coding/goals/today?date=` returns, per list, the problems due on the day, the ones solved on it and the next ones. `docs/openapi.json` regenerated.
- Goal list view (`frontend/src/coding-goal-list.tsx`): progress bar (`role="progressbar"`), filters (All, Left, Solved, Late; topic), problems in order 50 at a time, and "Open attempts" on a problem that has a row in the log: it filters the problem log to that problem and opens its attempts.
- Coding screen: each list shows its bar, late and weekly counts and the next problems, with a Problems button that opens the list.
- Quick log: the next problems of the goal lists come first in the picker ("Next: ..."). A goal problem not in the log yet is added with the list's title; one already in the log gets the attempt.
- Day log: one block, `<CodingGoalDay>`, in `frontend/src/study-logs.tsx` between the timer and the form (told lane-3 first). It shows per list what is due today, what was solved today and the next problems, and nothing without a goal list. `frontend/src/test/fake-api.ts` answers its request in the background answers, and the `screens.test.tsx` study-log server answers `/api/coding/goals`.

## Tests

- Backend unit: the counting rules (solved, late, solved before import, solved after the due day, week bounds, empty list); route checks for the new date query.
- Backend integration (needs a database): a problem solved before the import counts, a failed attempt does not, late, next, the due day and the solved-today lists. These use dates in 2097 so they do not meet the summary test's 2098 data.
- Frontend: bar and counts, filters, 50 at a time, Open attempts, lists on the Coding screen, quick log with goal problems (new and already logged), the day block with and without lists.
- e2e `e2e/coding-goal-progress.spec.ts`: seeds the list from the fixture, opens it, filters, logs the next goal problem and sees the bar move from 1 to 2 of 4, then sees the day block. Run in Chrome at 390x844 and 1440x900 with no sideways scroll at either.

## Check at 390x844 and 1440x900

Both e2e runs above passed locally against a throwaway Postgres 17: the goal lists card, the opened list, the quick log and the day log have no sideways scroll at either size.
