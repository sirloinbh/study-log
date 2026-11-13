# #48 Statistics dashboard main and key metric cards

- Issue: [#48](https://github.com/sirloinbh/study-log/issues/48) (parent #8)
- Branch: `feat/48-stats-dashboard`
- Prerequisite: #47 study time aggregation API (merged)

## Purpose

See at a glance the total study time, today, and the total and average for the chosen period. Charts are in the scope of #49, where the chart library must be decided, so I did not put them on this screen.

## Changes

- `frontend/src/main.tsx`: added a "통계" ("Statistics") page to the menu (study logs, textbooks, keywords, statistics, settings).
- `frontend/src/Stats.tsx`, `frontend/src/study-stats.ts` (a new file)
  - **Period filter:** buttons for this week (default), this month, the last 3 months, and all time (`aria-pressed`)
  - **4 metric cards**
    - Total study time: the whole cumulative figure
    - Today
    - Total for the chosen period: the card title becomes the period name ("이번 주" and so on, "This week"). It also shows the period dates and "N days studied out of M".
    - Daily average: based on the calendar days of the chosen period. It also shows the average based on days studied.
  - The values come from `GET /api/stats/study-time?period=` (#47) and are shown as "N hours M minutes". The display function uses `formatMinutes` of the study log screen as it is.
  - Responses are kept separately per period. A response for another period that arrives late does not overwrite or clear the current period's value. If you go back to a period you already saw, the kept value shows right away, and it changes when a new value arrives.
  - If loading fails, it shows an error instead of an empty card.
  - The type file name is `study-stats.ts`, not `stats.ts`. Windows does not distinguish case, so it would collide with `Stats.tsx` (keep the names different, like `exercise.ts` and `Exercises.tsx`).
- `frontend/src/style.css`
  - The layout of the period filter and the metric cards. The cards are laid out automatically with a minimum of 150px, so it is 4 per row on PC and 2 on mobile.
  - Dates do not wrap in the middle.
  - **Mobile menu:** with 5 menu items, it overflowed by 72px at 390px. On mobile only, I changed the menu to an icon on top and text below (12px), and divided the five cells into the same width (64px). This replaces the left and right margin rule that was reduced for 4 items in #40.

## Tests

- `backend/test/stats-ui.test.ts` (a new file, 4 tests)
  - It opens on this week, and the titles, values, and secondary text of the 4 cards are right
  - If you change the period, it requests that period, and the pressed state, card titles, and values change (this month, the last 3 months, all time)
  - A previous period's response that arrives late does not overwrite the new period's value
    - While writing this test, I found that the first implementation (keeping only one response) made a late response clear the new period's value and stall at "loading".
    - A real React prevents it with effect cleanup, but I changed to keeping per period so as not to rely on that alone.
  - The error display on failure, no empty card or "loading", and showing it again when you go back to another period

## Verification

| Command         | Environment                        | Result                                                       |
| --------------- | ---------------------------------- | ------------------------------------------------------------ |
| `npm run check` | Local, `TEST_DATABASE_URL` not set | exit 0. backend tests 187, pass 174, fail 0, skipped 13 (DB) |

- Browser: I checked by starting the Vite dev server and the #47 API (a local Docker test DB) with Playwright (Chromium). Based on today (2026-10-23), I put in 6 completed and abandoned records.
  - This week (10/19 to 10/23): total 4 hours 45 minutes (90+135+60 minutes), daily average 57 minutes (285/5), and 1 hour 35 minutes based on days studied (285/3). It is the same as the value I calculated by hand.
  - This month: total 8 hours 5 minutes, average 21 minutes (485/23), and 1 hour 37 minutes based on days studied
  - Mobile 390×844
    - The 5 menu items do not overflow (menu width 343px = content width, 64px each, no clipped text).
    - 2 cards per row, no card overflow, and no horizontal scroll
  - PC 1440×900: 4 cards in a row
  - Screenshots: [mobile 390×844 (this month)](assets/48-mobile-390x844.png), [PC 1440×900 (this month)](assets/48-pc-1440x900.png)

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no blocking comments. There is no issue to split off either.

- Confirmed points
  - The period card title follows the chosen period. The default is this week, so it matches the issue's "this week" card.
  - The effect, the keeping per period, and the scope of the error display are right.
  - The mobile menu change applies only at 760px or less, so it does not affect PC.
  - The heading structure and the accessibility of the period buttons are appropriate.
- Applied
  - I put `role="status"` on "불러오는 중…" ("Loading…") so a screen reader can know the change into cards.
  - The name of the card group followed the period, like "이번 주 학습 시간" ("This week's study time"), so even the total cumulative card sounded like a period value. I fixed the name to "학습 시간 지표" ("Study time metrics").
  - I added checks for both in the UI test.
- Kept: if you go back to a period you already saw, the kept value is shown as it is while the new value is received. There is no indication that it is being received again. It changes right away when the new value arrives.

## Automated code review, round 2

A separate read-only review agent checked the first-round fixes and the whole final PR again. The review is limited to 2 rounds, so I do not do a third.

- Even with the server status line at the top of the screen and the new "loading" status area together, there is no conflict. The test picks exactly the status area of the statistics screen.
- There were no comments and no issue to split off.

## Limits and follow-up

- The daily, weekly, and monthly charts are attached in #49 (the chart library decision). The API already gives daily, weekly, and monthly values.
- Filters by textbook and by study type are not in this issue's scope.
