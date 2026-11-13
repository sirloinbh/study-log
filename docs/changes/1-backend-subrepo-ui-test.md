# #1 Fix the UI test failure in the backend sub-repository CI

- Issue: [#1](https://github.com/sirloinbh/study-log/issues/1)
- Branch: `fix/1-backend-subrepo-ui-test`

## Problem

The deployment sub-repository `study-log-backend` holds only the `backend/` folder. But `npm test` read `../../frontend/src/main.tsx` in `test/app-ui.test.ts`, so 3 UI tests failed with `ENOENT` (GitHub Actions `Backend checks`). The umbrella repository CI was fine.

## Changes

- `backend/test/app-ui.test.ts`: if the `frontend/` folder is missing, register the UI tests as `test.skip`. In the umbrella repository they run as before. (At first it was based on `frontend/src/main.tsx`, and in the first review I changed it to be based on the folder.)

## Verification

- Regression reproduction: I copied only `backend/` to a temporary folder (linking the same `node_modules`) and ran `tsx --test`.
  - Before the fix: 8 tests / **4 pass / 3 fail** / 1 skip (DB, no URL)
  - After the fix: 8 tests / **4 pass / 0 fail** / 4 skip (UI 3 + DB 1)
- Umbrella repository `npm run check` (dedicated test DB `study_log_test`): **exit 0**, app and DB 8 pass / 0 fail / **0 skip** (the UI tests actually ran), skills 4 pass, build passed.
- Reflecting it in the sub-repository goes ahead with `scripts/push-repositories.ps1` after the PR is merged (on request).

## Automated code review, round 1 (PR #2)

- Comment (low): if skipping is based on whether `frontend/src/main.tsx` exists, then when the entry file name changes in the umbrella repository, the UI tests are silently skipped instead of failing.
  - Applied: changed the skip condition to whether the `frontend/` folder exists. If `main.tsx` disappears in the umbrella repository, it fails with `ENOENT`.
- Comment (low): the standalone backend layout was verified only by a manual reproduction.
  - Not applied (recorded only): the CI of the sub-repository `study-log-backend` handles continuous verification after the sync. It is not a scope worth splitting into a separate issue.
- Verification after the fix (after reflecting the main merge):
  - Umbrella repository `npm run check`: exit 0. App tests 8 tests / 7 pass / 0 fail / 1 skip (the DB integration test with `TEST_DATABASE_URL` not set, so DB verification was not run this time). The 3 UI tests ran. Skills 4 pass, build passed.
  - Standalone backend layout reproduction (only `backend/` copied to a temporary folder, `node_modules` linked): 8 tests / 4 pass / 0 fail / 4 skip (UI 3 + DB 1).

## Automated code review, round 2 (PR #2)

- Checked the first-round fix: the skip based on the folder works as intended in the umbrella repository and in the standalone backend layout. There are no code defects.
- Comment (low): the "Changes" section above still described the earlier condition (`main.tsx`).
  - Applied: fixed only the document in this commit.
- The review is limited to 2 rounds, so I do not do a third. There is no code change, so the previous `npm run check` result (exit 0) is still valid. The merge is decided by the CI of the final head.
