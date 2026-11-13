# #120 Add frontend tests for the main screens and logic files

- Issue: [#120](https://github.com/sirloinbh/study-log/issues/120)
- Branch: `chore/120-frontend-tests`

## Purpose

Check the main flows with real React and the DOM. `backend/test/*-ui.test.ts` also checks the same screens, but it looks only at the element tree with a fake React.

## Changes

I did not change the app code.

- `frontend/src/logic.test.ts`: `month-calendar.ts`, `toc.ts`, `study-stats.ts`, `pdf-toc.ts`.
- `frontend/src/screens.test.tsx`: study logs (list, add, delete, save failure, load failure), textbooks (list, add), table of contents (reorder, a rejected move), exercises (add, delete).
- `frontend/src/test/fake-api.ts`: stands in for `fetch` without a server.

## Implementation judgment

- The file names in the issue are the names from before #117. `study-logs.ts` became `study-logs-data.ts`, and this file and the other renames are in the #117 record.
- The issue said to check date boundaries in `Asia/Seoul`, but these logic files do not read the clock. They compute date strings in UTC, so there is nowhere to fix the clock. Instead I check the weekday of the start of a month and the year-end move.

## Verification

`npm run check` with `TEST_DATABASE_URL` set passed. Backend 341, frontend 154, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards.

To see whether the tests catch defects, I put in one defect at a time in the app code, ran them, and reverted. They caught 6 of 7, and the one missed was because the study date I entered was the same as today, so it could not tell "keep the date". I changed it to use a different date and checked again. This work only added tests, so I did not check in a browser.

## Review

The first review found 5 weak points in the tests and I fixed them. There were no defects in the app code.

- The add exercise test looked for the text in the input field, so it could not check that it appears in the list.
- The fake server ignored the query conditions, so it could pass with the calendar list instead of the recent logs. It now answers according to the conditions, and the test looks only inside the recent logs card.
- The table of contents move test could pass even with the disabled state while saving. It now checks the order received in the answer directly.
- Only the per-test limit was raised, and the 1 second of `findBy` and `waitFor` was unchanged. I raised it to 10 seconds in `screens.test.tsx` and `stats-review.test.tsx`. The limit recorded in the #117 record is resolved too.
- The fake server answered other APIs in the wrong shape, so the cards and the calendar of the textbook detail were not drawn.

I put the 3 reported defects (2 list reloads, ignoring the order received in the answer) into the app code, confirmed that all were caught, and reverted. The second review found no defects.
