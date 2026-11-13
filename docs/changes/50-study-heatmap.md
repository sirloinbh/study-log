# #50 Study heatmap (GitHub contribution style)

- Issue: [#50](https://github.com/sirloinbh/study-log/issues/50) (parent #8)
- Branch: `feat/50-study-heatmap`
- Prerequisites: #47 study time aggregation API, #48 statistics dashboard (merged)

## Purpose

See the amount of study per date over the last year at a glance.

## Decisions

I set the undecided rules by the criteria below. I also left them in an [issue comment](https://github.com/sirloinbh/study-log/issues/50#issuecomment-6357805533).

- **Range:** the last 53 weeks including the week that has today (the week starts on Monday). The first cell is the Monday 52 weeks ago. What is counted is the same as #47 (`Asia/Seoul`, excluding "planned" records and future dates).
- **Intensity levels (fixed criteria):** 0 minutes / under 30 minutes / 30 minutes to 1 hour / 1 to 2 hours / 2 hours or more, 5 levels.
  - I did not use a relative criterion fitted to the day with the most study. This is so the same color always means the same amount of study.
- **Location:** the "최근 1년" ("Last year") card under the metric cards on the statistics screen.

## Changes

- `backend/src/stats.ts`
  - `GET /api/stats/heatmap` -> `{ from, to, daily }`. `daily` is every date from the start Monday to today (0 on empty days).
  - I moved the daily query of #47 into `dailyMinutes` so the two APIs share it. The counting rules do not drift apart.
  - `heatmapWeeks` (53), `heatmapStart(today)`
- `frontend/src/Heatmap.tsx` (a new file), `frontend/src/study-stats.ts`, `frontend/src/Stats.tsx`
  - One column per week (Monday on top). The remaining days of this week are blank cells.
  - If that week has the 1st, "N월" ("Month N") is shown above the column. The weekdays (Mon, Wed, Fri) are shown on the left.
  - When you hover over each cell, "YYYY-MM-DD: N hours M minutes" appears (`title`).
  - For screen readers, the whole heatmap is announced as one picture (`role="img"`): "period, N days studied, total time". Each cell is not read.
  - Above the card there is "N days studied · total time", and below it the intensity legend.
  - Functions: `heatLevel` (the levels), `heatWeeks` (grouping by week), `monthLabel`
- `frontend/src/style.css`
  - 11px cells. On PC, 53 weeks fit on one screen.
  - On mobile, it scrolls horizontally inside the card, and at first the recent weeks (the right end) are visible. The weekday column is fixed on the left (`position: sticky`).
  - I gave the heatmap card `min-width: 0`. Without it, the grid item of the statistics screen grew to the heatmap width (757px), and the whole page scrolled horizontally on mobile.

## Tests

- `backend/test/stats.test.ts`: the heatmap start date. It is the Monday 52 weeks ago on a Friday basis, and it is 53 columns even on a Monday.
- `backend/test/stats.integration.test.ts` (a real DB): with "today" 2096-05-16 (Wed), it checks the following.
  - The range 2095-05-16 to today, 52 weeks + 3 days
  - The values of today, March, and January
  - No future records
- `backend/test/stats-ui.test.ts`
  - 2 columns with 2 weeks of data, the level of each cell (boundary values 10, 30, 59, 60, 119, and 120 minutes), and blank cells for the remaining days of this week
  - The tooltip, the summary for screen readers, the top summary, and the legend
  - If loading the heatmap fails, it shows an error and the metric cards stay as they are
  - Unit tests for the level boundaries (0, 1, 29, 30, 59, 60, 119, 120, 600 minutes), grouping by week, and the month label

## Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 191, pass 178, fail 0, skipped 13 (DB) |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 009 applied | exit 0. tests 191, pass 191, fail 0, skipped 0               |

- Browser: I checked by starting the Vite dev server and this branch's API (a local Docker test DB) with Playwright (Chromium). I put in 161 completed records spread evenly across the past year.
  - API: 2025-10-20 to 2026-10-23, 369 days, 165 days studied
  - Mobile 390×844
    - 53 columns, and at first the right end (the recent weeks) is visible
    - The weekday column is fixed
    - No horizontal page scroll. In the first implementation the card grew and the page scrolled, and I fixed it with the `min-width: 0` above.
  - PC 1440×900: 53 weeks fit on one screen with no scroll.
  - Screenshots: [mobile 390×844 (heatmap card)](assets/50-mobile-390x844.png), [PC 1440×900](assets/50-pc-1440x900.png)

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no comments, so I do not do a second review. There is no issue to split off either.

- Confirmed points
  - The start date is always a Monday, so grouping by week is right. No empty series appear.
  - React keys do not collide.
  - Even after extracting the daily query, the #47 API behaves the same.
  - The scroll effect is safe. The accessibility handling (one picture + hidden cells, the legend) is appropriate.
  - The background of the fixed weekday column is opaque.
- Note (kept)
  - The scroll target is found by id. There is only one heatmap on a screen, so they do not collide.
  - The legend list is `list-style: none`, so it may not be read as a list by a Safari screen reader.
  - The point that month labels could overlap between neighboring weeks does not actually happen. The 1st of each month is at least 4 weeks apart, so it cannot fall in two neighboring weeks at once.

## Limits and follow-up

- The value of each cell can be seen only in a mouse tooltip. There is no feature to tap a cell on a touch device to see its value.
- On mobile, the month names that pass behind the weekday column may be only partly visible.
