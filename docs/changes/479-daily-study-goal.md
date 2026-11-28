# 479: One 2-hour daily study goal

## Decisions

- The goal is a fixed 120 minutes for every day, with no weekday, weekend or holiday difference (user request, epic #469).
- Study time is entered by hand, so today's progress is the minutes of today's logs that are not planned (the dashboard's `counted` rule). The streak keeps its meaning.
- Choice for implementation (D1, answered by the user 2026-11-28): the user decided to drop the old data, so `database/migrations/040_drop_weekly_goals.sql` drops `weekly_goals` (migration 029 created it). The number is the next free one on origin/main at push time.
- Schedules keep their two per-schedule amounts, so a person can still override them, but both default to 2 hours. Holidays are still read, so schedules still skip no day; `HOLIDAY_API_KEY` stays.

## What changed

- `backend/src/study-goal.ts`: `GET /api/stats/goal` now returns `{ date, goalMinutes: 120, studiedMinutes (today), achievementRate, streakDays, studiedToday }`. `PUT /api/stats/goal` and `goalInput` are removed.
- `frontend/src/study-goal.tsx`: the "Weekly goal" card became "Daily goal": today's rate, progress bar and streak, with no goal form.
- `frontend/src/schedule.ts`: `defaultHours` is 2 and 2. `docs/decisions/schedule-rules.md` section 1 updated.
- OpenAPI table and `docs/openapi.json` updated.

## Tests

- `backend/test/study-goal.integration.test.ts`: PUT is gone (404, no DB call); with a DB (CI only): today's rate against 120, planned logs do not count, the streak, and the same goal on another day.
- `frontend/src/study-goal.test.tsx`, `frontend/src/schedules.test.tsx` (form starts at 2 and 2).
