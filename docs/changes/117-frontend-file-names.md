# #117 Rename the frontend files to lowercase with hyphens

- Issue: [#117](https://github.com/sirloinbh/study-log/issues/117)
- Branch: `chore/117-frontend-file-names`

## Purpose

Match the file names in `frontend/src` to lowercase with hyphens, like the other apps and the central rule. Behavior does not change.

## Changes

- Renamed 16 screen files. There were 15 when the issue was registered, and `ReviewRateChart.tsx`, added in #52, was renamed with them. The component names are unchanged.
- The screen `StudyLogs.tsx` became `study-logs.tsx`, which collides with the import path of the logic file `study-logs.ts`, so I renamed the logic file to `study-logs-data.ts`. This is the only pair of files whose names collide. Files that differ by singular and plural, such as `exercise.ts` and `exercises.tsx`, stay as they are.
- Fixed the imports in `frontend/src` and `backend/test`. The old names in past change records (`docs/changes`, `docs/daily`) are records of the time, so I did not fix them.

- `frontend/src/stats-review.test.tsx`: right after a code change, the first full check often failed by going over the 5 second limit (it passed on a re-run). I removed the role lookup that `reviewCard` did on every call, and made the card title checked in only one test. I also raised the per-test limit of this file to 20 seconds. I only presumed the cost of the role lookup was the cause and did not measure it. The default 1 second wait of `findBy` and `waitFor` is unchanged, so it can fail again in a slower environment.

## Review

The first review found no defects in the app code and the imports. I fixed that the test did not check the card title further and that this record described the role lookup change inaccurately. The second review found no defects.

## Verification

`npm run check` with `TEST_DATABASE_URL` set passed twice in a row. Backend 338, frontend 123, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards. The file name warning of `npm run standards:check` is gone.

With headless Chrome I checked 35 items on the statistics and study log screens at PC 1440×900 and mobile 390×844. The other screens were checked only with automated tests and the build.

File name case is not distinguished on Windows, so CI on Linux, which distinguishes case, actually checks the imports.
