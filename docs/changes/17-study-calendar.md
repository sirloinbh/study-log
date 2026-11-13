# #17 Study log calendar view

- Issue: [#17](https://github.com/sirloinbh/study-log/issues/17) (parent #9)
- Branch: `feat/17-study-calendar`
- Prerequisite: #10 study log DB and API (merged)

## Purpose

See at a glance whether you studied and for how long on each date in a calendar, and pick a date to see that day's log.

## Decisions

I set the undecided rules by the criteria below. I also left them in an [issue comment](https://github.com/sirloinbh/study-log/issues/17#issuecomment-6358642189).

- **Study time per date:** as in the statistics (#47), add only the time without the "planned" status.
- **Number of records:** count all records including planned ones. This is so a day with only planned records can also be entered as that day's log.
- **Month boundary:** the study date is already an `Asia/Seoul` date. So it is divided by the study dates from the 1st to the last day of that month. A record that crosses midnight belongs to its start date. The default month is the month that has today in the service time.
- **Shape:** the week starts on Monday (same as the statistics and heatmap), and it goes on the study log screen.

## Changes

- `backend/src/calendar.ts` (a new file), `backend/src/app.ts`
  - `GET /api/study-logs/calendar?month=YYYY-MM` -> `{ month, days: [{ date, minutes, logs }] }`. It gives every date of that month (0 on empty days).
  - It is connected before the study log router. Otherwise `calendar` would be read as a study log ID and give 400.
  - A wrong month (month 13, year 0000, `2026-1`, and so on) gives 400 "월은 YYYY-MM 형식으로 입력하세요" ("Enter the month in YYYY-MM format").
  - `monthRange`: the 1st and the last day of that month (including leap years)
- `frontend/src/Calendar.tsx` (a new file), `frontend/src/month-calendar.ts` (a new file), `frontend/src/StudyLogs.tsx`
  - Put a "YYYY년 M월" ("Month M of YYYY") calendar card at the bottom of the study log screen. It has previous and next month buttons, and if you are viewing another month, a "이번 달" ("This month") button appears.
  - Date cells
    - They show the date and a short study time (45 minutes, 1.5 hours).
    - A day studied has a light background, today has a bold date, and the chosen date has a border (`aria-pressed`).
    - Name for screen readers: "date, studied N hours M minutes (or no study), N records"
  - When you press a date, that day's log (time, study time, status, and note) is shown below the calendar. At first today is picked.
  - If you save or delete a study log on the same screen, the calendar and that day's log are loaded again (`reloadKey`).
  - Responses are kept separately per month and per date. A late response for another month does not mix in.
  - The helper file is named `month-calendar.ts`. A name that differs from `Calendar.tsx` only by case collides on Windows (see #48).
- `frontend/src/style.css`: the 7-column calendar grid and the date cell display

## Tests

- `backend/test/calendar.test.ts`: month ranges (30 and 31 days, February in a common year and a leap year, December), a wrong month 400, and the default month = the month that has today
- `backend/test/calendar.integration.test.ts` (a real DB, year 2100): it checks the month boundary.
  - The last day of the previous month and the 1st of the next month do not come in.
  - A record that crosses midnight belongs to the 1st.
  - Planned records go only into the count.
  - February 2100 is a common year, so it is 28 days.
  - The default month is right.
  - I picked a year that does not overlap with other test files. The statistics test compares the cumulative total up to 2096-05-16 as the baseline, so a year before that (the 2095 I first picked) could shake that test in a parallel run.
- `backend/test/calendar-ui.test.ts` (a new file, 7 tests after the first-review fixes)
  - Week start on Monday: 3 blank cells before 10/1 (Thu)
  - Date cell names and short times, the today and selected marks
  - When you pick a date, that day's log and the empty day notice
  - Moving to the previous, next, and this month
  - Loading again after saving a study log, and the load failure display
  - Helper functions (moving months, the number of blank cells, the short time)
- `backend/test/study-logs-ui.test.ts`
  - The study log screen test verifies the recent list, so the fake API gives an empty answer to the calendar request and leaves it out of the request record.
  - The button name test is narrowed to inside the recent list.

## Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 201, pass 187, fail 0, skipped 14 (DB) |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 009 applied | exit 0. tests 201, pass 201, fail 0, skipped 0               |

- The first `npm run check` was exit 2 because of a type error in the new tests. After fixing it, the result is the one above. `npm test` does not do a type check, so it passed even then.
- Browser: I checked by starting the Vite dev server and this branch's API (a local Docker test DB) with Playwright (Chromium).
  - Mobile 390×844
    - "2026년 10월", 3 blank cells before the 1st (Thu)
    - The short times per date match the API values
    - Pressing the 14th shows 1 log for that day (19:00-21:00, 2 hours)
    - No card overflow and no horizontal scroll
  - PC 1440×900: the 7-column calendar and that day's log, no horizontal scroll
  - Screenshots: [mobile 390×844 (calendar card)](assets/17-mobile-390x844.png), [PC 1440×900](assets/17-pc-1440x900.png)

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no backend comments. There is no issue to split off either.

- Confirmed points (backend): the route connection order, the month regular expression (year 0000, months 00 and 13), 0 on empty days with `FILTER` and `count`, and the leap year month range.
- Applied (important): loading the month and loading the date shared one error state.
  - Even if only the date log failed, "캘린더를 불러오지 못했습니다" ("Could not load the calendar") appeared, and the log area stalled at "불러오는 중…" ("Loading…").
  - If one side succeeded, the other side's error was cleared or, conversely, remained.
  - Fix: I split the month error and the date error by tagging them with the month and the date. The date error is shown in the log area as "일지를 불러오지 못했습니다" ("Could not load the log").
  - I added a regression test ("shows a date failure and a month failure separately"). I confirmed it fails on the code before the fix and passes after the fix.
- Note (kept)
  - If you go back to a month or date you already saw, the kept value is shown while the new one is received. It changes when the new value arrives.
  - Loading the calendar again after save and delete is checked by the "loading again after saving a study log" test in `calendar-ui.test.ts`.

## Automated code review, round 2

A separate read-only review agent checked the first-round fixes and the whole final PR again. The review is limited to 2 rounds, so I do not do a third.

- It was confirmed that the month and date errors are shown and cleared only by their own tags. If a reload succeeds, the error is cleared, and even in a failed month it does not stall at "loading".
- There were no comments and no issue to split off.

## Limits and follow-up

- The calendar is under the recent records list. If there are many recent records, you must scroll to see it.
- The log list in the calendar is read-only. Edit and delete are done in the recent list above.
