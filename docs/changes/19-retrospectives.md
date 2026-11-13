# #19 Write and view weekly and monthly retrospectives

- Issue: [#19](https://github.com/sirloinbh/study-log/issues/19) (parent #9)
- Branch: `feat/19-retrospectives`
- Prerequisites: #10 study log DB and API, #96 week start changed to Sunday (merged)

## Purpose

Leave a retrospective that looks back at studying by week and by month. You write it while looking at the study summary of that period.

## Decisions (confirmed with the user, 2026-10-23)

I left them in an [issue comment](https://github.com/sirloinbh/study-log/issues/19#issuecomment-6359133797).

- **The week start day: Sunday.** A weekly retrospective runs Sunday to Saturday. I changed the existing statistics, heatmap, and calendar to the same criterion (#96).
- **One retrospective per period.** If you save a retrospective for the same week or month again, it edits that retrospective. Weekly and monthly are separate (even if they include the same date, one each).

## Changes

- `database/migrations/010_retrospectives.sql`: the `retrospectives` table
  - Columns: the kind (`weekly`/`monthly`), the period start and end, and the body (not only spaces, 20000 characters or fewer)
  - Unique constraint `(kind, period_start)`: one per period
  - CHECK: for weekly, the start is a Sunday and the end is +6 days, and for monthly, the start is the 1st and the end is the last day of that month. The DB also keeps the period shape, not only the API.
- `backend/src/retrospectives.ts` (a new file), `backend/src/app.ts`

  | Request                                      | Behavior                                                                                                                                                      |
  | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `GET /api/retrospectives/period?kind=&date=` | The period of the week or month that has that date (default: weekly, today), the retrospective written (`null` if none), and the study summary of that period |
  | `GET /api/retrospectives?kind=&limit=`       | Recent retrospectives (by period start descending, default 20)                                                                                                |
  | `PUT /api/retrospectives/:kind/:start`       | Saves with `{ body }`. If it exists, it edits (`ON CONFLICT`). 200 `{ retrospective }`                                                                        |
  | `DELETE /api/retrospectives/:kind/:start`    | 204. If none, "회고를 찾을 수 없습니다" ("Retrospective not found") 404                                                                                       |
  - Study summary: study time, days studied, number of study records, and the number of records marked goal achieved out of those marked. As in the statistics, "planned" records are not counted as study.
  - If the start date in the path is not the first day of the period, 400: "주간 회고는 일요일부터 시작합니다" ("A weekly retrospective starts on Sunday") / "월간 회고는 1일부터 시작합니다" ("A monthly retrospective starts on the 1st"). The server calculates the end date.
  - The period calculation uses the statistics' `weekStart` (Sunday) and the calendar's `monthRange` as they are.

- `frontend/src/Retrospectives.tsx`, `frontend/src/retrospective.ts` (a new file), `frontend/src/main.tsx`, `frontend/src/style.css`
  - Added a "회고" ("Retrospective") page to the menu. The 6 mobile menu items fit at 390px with no overflow.
  - **Writing card**
    - Switching weekly/monthly, previous and next, and a "이번 주/이번 달" ("This week/This month") button if it is not the current period
    - Title "2026년 10월 18일 ~ 10월 24일 주간 회고" ("Weekly retrospective for Oct 18 to Oct 24, 2026")
    - 4 summary cells, the retrospective input, save ("수정 저장", "Save edit", if it exists), delete (2-step confirmation), and the last saved time
  - Input not yet saved is kept tied to the period (kind + start date). Even if you go to another period and come back, it remains when you return to that period.
  - Focus in the delete flow follows the #65 and #86 rule: the confirm button -> the delete button on cancel -> the retrospective title after delete.
  - **Past retrospectives card:** the latest 20 (kind and period, a 2-line preview of the body). Pressing one opens that retrospective.
  - A duplicate save in the same tick is blocked with `useBusy` (#75).

## Tests

- `backend/test/retrospectives.test.ts`: week and month periods (Saturday, Sunday, the year end, a leap year February), 400 for a wrong kind, start date, body, and lookup conditions, the save parameters (end date calculation), the default period, and 404 for deleting a missing retrospective
- `backend/test/retrospectives.integration.test.ts` (a real DB, year 2102)
  - The period summary (excluding planned, the Sunday and Saturday boundaries, excluding the next week, the number of goals achieved)
  - Even if you save again after saving, it is one row and the same ID
  - A monthly retrospective of the same date is separate, and the end date of February in a common year
  - The list order, and delete
  - DB constraints: a weekly one that is not a Sunday 23514, a wrong month end 23514, and a second one for the same period 23505
- `backend/test/retrospectives-ui.test.ts` (a new file, 9 tests after the first-review fixes)
  - This week's retrospective and the summary display, save and save again (edit), moving the period and keeping the draft, and switching to monthly
  - Delete confirmation and focus, opening a past retrospective, load failure, and the period functions (a week title that crosses the year end)

## Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 221, pass 205, fail 0, skipped 16 (DB) |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 010 applied | exit 0. tests 221, pass 221, fail 0, skipped 0               |

- I applied 010 twice to the same DB and confirmed it is safe to re-run.
- Browser: I checked by starting the Vite dev server and this branch's API (a local Docker test DB) with Playwright (Chromium) (today is 2026-10-23).
  - Mobile 390×844
    - The 6 menu items do not overflow
    - "2026년 10월 18일 ~ 10월 24일 주간 회고", summary 6 hours 15 minutes, 4 days, 4 records
    - Saving a multi-line retrospective -> "저장했습니다" ("Saved"), "수정 저장", shown in the past retrospectives list, and I confirmed the saved value through the API
    - No horizontal scroll
  - PC 1440×900: the 4 summary cells in a row, no horizontal scroll
  - Screenshots: [mobile 390×844 (whole page)](assets/19-mobile-390x844.png), [PC 1440×900](assets/19-pc-1440x900.png)

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no comments at or above the bar. There is no issue to split off either.

- Confirmed points
  - The summary SQL and the month end CHECK calculation are right.
  - The upsert and `updated_at` are right.
  - A ZodError made by hand becomes 400 in the shared error handler.
  - There are no path conflicts or circular imports.
- Applied
  - Right after saving, until the reload finished, the old body was briefly visible and editable. The screen value is now changed right away with the save and delete responses.
    - In the same work, I also found a problem that if the reload failed, the input form disappeared and only the error remained. If a period was already received, the form is kept and the error is shown together above it.
  - A week near 0001-01-01 or 9999-12-31 went into a year the DB cannot store and became a 500. I limited the retrospective date to the years 1900 to 9998, and it gives 400 "회고 날짜는 1900년부터 9998년까지입니다" ("The retrospective date is from the year 1900 to 9998").
  - When switching from weekly to monthly, it went to the month that has the week's Sunday. Example: from the week of 11/29 (Sun) to 12/5, it went to November. Now it goes to the month that has the week's Wednesday, that is, the month most of the week belongs to.
  - I added 3 regression tests (the date range, display right after save and keeping the form when loading fails, and switching to monthly). I confirmed they fail on the code before the fix and pass after the fix.
  - I fixed the expected value of 1 existing test to match the new rule (the week's Wednesday).
- Kept: "today" on the screen is the date received at the server status check. If you cross midnight with the screen open, the "this week" decision can be a day late.

## Automated code review, round 2

A separate read-only review agent checked the first-round fixes and the whole final PR again. The review is limited to 2 rounds, so I do not do a third.

- It was confirmed that the place the save and delete responses are reflected, keeping the summary after a delete, showing the error and the form together, the date limit (including the start date in the path), and the date for switching kinds are right.
- There were no comments at or above the bar and no issue to split off.
- Note (kept)
  - If you press previous and next thousands of times and reach the 1900 or 9998 end, that period is 400, so only the error remains without a form. It can come out through the past retrospectives list or a refresh.
  - If the same period was left open with a different date key, when you go back, the old body is briefly shown and then changes when it is loaded again.

## Limits and follow-up

- The study pattern summary (#20) is attached to this screen.
- The retrospective body is plain text. Markdown rendering is reviewed together in #16.
