# #18 Study log search (keyword, period, textbook)

- Issue: [#18](https://github.com/sirloinbh/study-log/issues/18) (parent #9)
- Branch: `feat/18-study-log-search`
- Prerequisite: #10 study log DB and API (merged)

## Purpose

Find past study records by search term, period, and textbook conditions.

## Decisions

I set the undecided rules by the criteria below. I also left them in an [issue comment](https://github.com/sirloinbh/study-log/issues/18#issuecomment-6358798339).

- **What is searched:** the note and "difficult parts" ("어려웠던 부분"). It is a case-insensitive partial match, and `%` and `_` are searched as literal characters (same as the keyword search #39).
- **Combination:** the search term, period, and textbook are all AND. A condition left empty is not applied.
- **Result:** most recent date and time first, at most 100. It adds conditions to the existing list API, so the response format is the same.
- **Location:** the search card on the study log screen. The results are read-only.

## Changes

- `backend/src/study-logs.ts`: added the `q` (50 characters or fewer), `from`, and `to` conditions to `GET /api/study-logs`. They can be used with the existing `date`, `textbookId`, and `limit`.
  - If the start date is later than the end date, 400 "시작일은 종료일보다 늦을 수 없습니다" ("The start date cannot be later than the end date").
- `backend/src/sql.ts` (a new file): moved the LIKE escape function `likePattern` from the keyword API so the two APIs share it.
  - At first I made the study log module import it from the keyword module. But the keyword module already used the date function of the study log module, so it became a circular import. Depending on the load order, a reference-before-initialization error could occur, so I moved it to a shared module.
- `frontend/src/StudyLogSearch.tsx` (a new file), `frontend/src/study-logs.ts` (`studyLogSearchPath`), `frontend/src/StudyLogs.tsx`
  - Put a "학습 기록 검색" ("Study log search") card between the recent records and the calendar on the study log screen.
  - Input: the search term, the start and end dates (`min` and `max` block a crossed period), and the textbook (all or the textbook list, using the list the screen already loaded)
  - Result: the count (if 100, "최근 100개까지 보여 줍니다", "Showing up to the latest 100"), date, time, study time, status, textbook, difficult parts, and note
  - If you save or delete on the same screen, the visible search result is searched again. If the search fails, the old result is cleared.
  - A duplicate search in the same tick is blocked with `useBusy` (#75).

## Tests

- `backend/test/study-logs.test.ts`
  - A search term over 50 characters, start date > end date, and a wrong date -> 400
  - The query parameters of the combined conditions and the escape of `%` and `_`
- `backend/test/study-log-search.integration.test.ts` (a real DB, a new file, year 2101 data)
  - Searching notes and difficult parts, ignoring case
  - Searching `50%` and `%` as literal characters
  - Search term + textbook, textbook only, period only, search term + narrow period, and no result
  - Every search is limited to the year 2101 so it does not mix with records from other files. The year 2101 does not overlap with the statistics tests (cumulative up to 2096-05-16) or with the dates of other files.
- `backend/test/study-log-search-ui.test.ts` (a new file, 5 tests)
  - The request path with only the filled conditions and the result display, and the textbook condition
  - No result, the error display and removing the old result on failure
  - Searching again after save, and the path building function
- `backend/test/study-logs-ui.test.ts`: I narrowed the scope of the two tests that verify the input form (locking during a request and the textbook choices) to the first form. This is because the search card also has an input field and a "교재" ("Textbook") select.

## Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 210, pass 195, fail 0, skipped 15 (DB) |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 009 applied | exit 0. tests 210, pass 210, fail 0, skipped 0               |

- Browser: I checked by starting the Vite dev server and this branch's API (a local Docker test DB) with Playwright (Chromium).
  - Mobile 390×844: the search term "#48" + start date 2026-10-10 -> "4개를 찾았습니다" ("Found 4") (10/23, 22, 20, 14). The 10/2 record is out of the period so it dropped out. No horizontal scroll.
  - PC 1440×900: the same result, with start date, end date, and textbook in one row
  - Screenshots: [mobile 390×844 (search card)](assets/18-mobile-390x844.png), [PC 1440×900](assets/18-pc-1440x900.png)

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no comments at or above the bar, so I do not do a second review. There is no issue to split off either.

- Confirmed points
  - The SQL parameter numbers and the escape are right.
  - The combination with the `date` condition is right too (AND).
  - No other code depends on the shape of `listQuery` (`.shape`).
  - The effect that searches again does not search when first opened, and uses the latest result path.
  - The status area for the result count and errors is appropriate.
- Note (kept)
  - The error message for a wrong start or end date is "학습일은 YYYY-MM-DD 형식으로…" ("The study date must be in YYYY-MM-DD format…"). The screen is a date input, so it is hard for the user to see.
  - If the moment the user presses search overlaps with a save elsewhere, the order of the two search responses can swap. It is a rare case.
  - Even if the result is exactly 100, it shows "최근 100개까지 보여 줍니다".

## Limits and follow-up

- It does not search by textbook title or table of contents title. You pick it with the textbook condition.
- The result is at most 100. There is no "show more".
