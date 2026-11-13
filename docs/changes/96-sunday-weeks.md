# #96 Change the week start in the statistics, heatmap, and calendar to Sunday

- Issue: [#96](https://github.com/sirloinbh/study-log/issues/96)
- Branch: `feat/96-sunday-weeks`

## Purpose

In the check before starting #19 (the weekly retrospective), the user decided that the week starts on **Sunday** (2026-10-23). The user also asked to change the statistics (#47), heatmap (#50), and calendar (#17), which were already implemented with a Monday start, to start on Sunday too. This is to use the same criterion as the upcoming weekly retrospective.

## Changes

- `backend/src/stats.ts`: changed `weekStart` to that week's Sunday. This one change also changes the following.
  - The statistics "this week" period: Sunday to today
  - The grouping basis of weekly totals (`weekly[].weekStart` is a Sunday)
  - The heatmap range: from the Sunday 52 weeks ago
- `frontend/src/Heatmap.tsx`: the cell order is Sunday to Saturday (top to bottom). The weekday labels go on the Monday, Wednesday, and Friday rows.
- `frontend/src/Calendar.tsx`, `frontend/src/month-calendar.ts`: the header is "일 월 화 수 목 금 토" (Sun Mon Tue Wed Thu Fri Sat), and the number of blank cells before the 1st is the weekday number of the 1st (Sunday is 0).
- `frontend/src/study-stats.ts`: fixed the description of grouping by week to be based on Sunday. The behavior is unchanged because it groups 7 at a time in the order of the dates received.
- "Monday start" in the earlier work records (`docs/changes/47-…`, `50-…`, `17-…`) is a record of the decision at the time, so I do not fix it. This document records the change.

## Tests

I recalculated and fixed the expected values on a Sunday basis.

- `backend/test/stats.test.ts`
  - Week start: Friday -> that week's Sunday, Saturday -> the preceding Sunday, Sunday -> that day, crossing the year end
  - The start of the "this week" period, the weekly grouping key, and the heatmap start date. If Sunday is today, this week is one day.
- `backend/test/stats.integration.test.ts` (a real DB, "today" is Wednesday 2096-05-16)
  - This week: 5/13 (Sun) to 5/16, 4 days, 170 minutes. The record on Sunday 5/13 goes into this week. On a Monday basis it was 3 days and 150 minutes.
  - Weekly grouping of this month: 4/29 45 minutes, 5/6 0 minutes, 5/13 170 minutes
  - Heatmap: 368 days from 2095-05-15 (Sun)
- `backend/test/stats-ui.test.ts`: moved the heatmap 2-week example to start on Sunday (10/4).
- `backend/test/calendar-ui.test.ts`: 4 blank cells before 10/1 (Thu) (Sun to Wed), and the blank cell function (3/1 Sunday 0, 6/1 Monday 1, 10/1 Thursday 4)
- I confirmed that the 6 changed tests fail on the code before the fix (Monday) and pass after the fix.

## Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 210, pass 195, fail 0, skipped 15 (DB) |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 009 applied | exit 0. tests 210, pass 210, fail 0, skipped 0               |

- Browser: I checked by starting the Vite dev server and this branch's API (a local Docker test DB) with Playwright (Chromium) (today is Friday 2026-10-23).
  - API: "this week" 2026-10-18 (Sun) to 10-23, 6 days. The heatmap starts 2025-10-19 (Sunday).
  - Mobile 390×844
    - The calendar header "일월화수목금토", and after 4 blank cells in the first row of October, the 1st, 2nd, and 3rd
    - The statistics "this week" card "2026-10-18 ~ 2026-10-23, 4 of 6 days studied" (shown in Korean)
    - In the heatmap weekday column, Sunday is at the top, and names are attached to Monday, Wednesday, and Friday.
    - No horizontal scroll
  - PC 1440×900: the statistics card and the heatmap, no horizontal scroll
  - Screenshots: [calendar mobile](assets/96-calendar-mobile-390x844.png), [heatmap mobile](assets/96-heatmap-mobile-390x844.png), [PC 1440×900](assets/96-pc-1440x900.png)

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no comments, so I do not do a second review. There is no issue to split off either.

- Confirmed points
  - No code based on Monday remains. The remaining mentions of "Monday" are only in earlier work records.
  - The heatmap columns are right as Sunday to Saturday, and the weekday labels match.
  - The calendar blank cell calculation is right. I also checked by hand the expected values of the recalculated tests (368 days, weekly grouping, and so on).
  - If today is Sunday, this week is one day, but it does not divide by zero.

## Limits and follow-up

- The #19 weekly retrospective is implemented with this criterion (the week starts on Sunday).
