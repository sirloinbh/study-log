# 361: Weekly study goal and streak

## Decisions (recorded on the issue, 2026-11-23)

- The goal is per week, in minutes. Weeks run Sunday to Saturday (`Asia/Seoul`).
- A study day is a day with any log that is not planned. This is the dashboard's own rule for study days and minutes (`counted` in `stats.ts`), so the goal, the cards and the streak agree.

## What changed

- `database/migrations/027_weekly_goals.sql`: `weekly_goals (week_start, goal_minutes 1..10080)`. A week without a row uses the latest earlier goal, so a goal stays until it is changed; the earlier weeks keep their own.
- `backend/src/study-goal.ts`, mounted at `/api/stats/goal` before the stats routes: `GET` returns this week's range, goal (and the week it was set in), minutes studied so far, the rounded achievement rate (null without a goal, above 100 when beaten) and the streak; `PUT {minutes}` sets this week's goal (validated 1 to 10080 whole minutes, audited).
- The streak is the newest run of consecutive study days. It counts to today, or to yesterday while today has no study yet, so it only breaks when a whole day passes without study.
- `counted` is exported from `stats.ts`; OpenAPI table and `docs/openapi.json` list both routes.
- Frontend `study-goal.tsx`: a "Weekly goal" card on the stats page (rate, progress bar, minutes done, streak, and a goal form in hours). The bar stops at 100%; the rate keeps counting.
- `test/fake-api.ts`: a small table of answers for cards that sit beside what a test is about (timer, goal), so those tests need no change.

## Tests

- `backend/test/study-goal.integration.test.ts`: validation before the database (runs without a DB); with a DB (CI only): no goal, 150 of a 300-minute goal is 50%, planned logs do not count, the streak runs to yesterday while today has only a plan and then includes a done log today, a changed goal replaces the old one, the next week carries the goal and ends the streak, the earlier week keeps its goal.
- `frontend/src/study-goal.test.tsx`: no goal, 10 hours with 5 studied is 50%, over 100%, the streak and its hint, invalid goals cannot be sent, a refused save keeps the typed value, a failed load.

## Checked

- Browser (Vite, mock API, no database): 390x844 and 1440x900, set a goal of 10 hours, 55% with the bar, the streak line, the goal kept after a reload, no overflow.
- The backend integration tests ran in CI only. `npm run check` and CI: see the PR.
