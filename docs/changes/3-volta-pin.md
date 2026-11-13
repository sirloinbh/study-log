# Pin the Node and npm versions with Volta (#3)

- Issue: https://github.com/sirloinbh/study-log/issues/3
- Date: 2026-10-21 (Asia/Seoul)

## Purpose

On a development PC that uses Volta, `.node-version` and `.nvmrc` are not read, so the default toolchain (Node 22.17.0 / npm 10.9.2) was used. Make Node 24.21.0 / npm 11.19.0 be selected automatically inside the repository.

## Changes

- `volta pin node@24.21.0 npm@11.19.0`: added a `volta` field to the root `package.json`. The version values are the same as the existing `engines` and `.node-version`.
- I put the same `volta` values in `frontend/package.json` and `backend/package.json` too (reflecting the first review, see below).
- Added the fact that Volta pins the versions to the development baseline in the README.
- No package installed or removed. App behavior did not change, so I did not add new tests.

## Verification

- Inside the repository, `node -v` gave `v24.21.0` and `npm -v` gave `11.19.0` (confirming the pinned values apply instead of the Volta default 22.17.0).
- With the dedicated test DB `study_test` (a local Compose DB, migrations applied with `psql -f`), I set `TEST_DATABASE_URL` and ran `npm run check`: the result is recorded below.
  - `npm run check`: **exit 0**. App and DB tests 8 pass / 0 fail / 0 skip (the DB integration test actually ran), skill check 4 pass / 0 fail / 0 skip, and format, lint, types, and build passed.
- Local `docker compose up --build -d` (run after the user's confirmation): db, api, and web started, `http://localhost:8092/` gave 200, and `/api/health` gave `{"ok":true,"service":"study-log","today":"2026-10-21"}`.

## Limits

- Environments that do not use Volta (nvm and so on) follow `.node-version` and `.nvmrc` as before.
- There was no screen change, so I did not check in a browser.

## Automated code review, round 1 (PR #4)

After merging `origin/main` (#54, #2) into this branch, a separate read-only review agent reviewed it.

- Comment (medium): Volta reads only the `volta` field of the nearest `package.json` and does not go up to the parent folder. So the root pin does not apply inside the `frontend/` and `backend/` folders or in the deployment sub-repositories.
  - Reproduction: in a temporary folder, I put the root `volta.node=22.17.0` and a `package.json` without `volta` in a subfolder. At the root, `v22.17.0` was selected, and in the subfolder, the Volta default at review time, `v24.21.0`, was selected. When I put `volta` in the subfolder too, `v22.17.0` was selected.
  - Applied: I put the same `volta` values directly in `frontend/package.json` and `backend/package.json`. The sub-repositories have no `../package.json`, so I do not use `extends`.
- Comment (low): the development environment setup baseline `docs/project-setup.md` lacked the Volta pin.
  - Applied: I added the `volta` field to the root `package.json` example, the workspace baseline in 5.6, and bootstrap step 3.
- There is no test that checks that the pinned versions match each other. I did not add one in this scope.
- Verification after the fix:
  - `npm run check`: exit 0. App tests 8 tests / 7 pass / 0 fail / 1 skip (the DB integration test with `TEST_DATABASE_URL` not set, so DB verification was not run this time). Skills 4 pass, and format, lint, types, and build passed.
  - `volta which node` points to 24.21.0 at the root, in `frontend/`, and in `backend/`. At review time, this PC's Volta default had changed to 24.21.0 (confirmed with `volta list`. The default at the time of writing the PR was the 22.17.0 written in the Purpose section above). So the result in the subfolders alone does not show a difference. I confirmed the difference in behavior with the temporary folder reproduction above.
  - npm ignores the `volta` field, so there is no effect on `npm ci`, the lockfiles, or the Docker build.

## Automated code review, round 2 (PR #4)

- Checked the first-round fix: all three `package.json` files have the same `volta` values. There is no effect on the lockfiles, CI, or Docker. There are no code defects.
- Comment (low): the Volta default notation in this record (22.17.0 and 24.21.0) looked contradictory. Also, the "Changes" section lacked the workspace additions.
  - Applied: I stated that the default differed by time, and wrote the workspace `volta` addition in the "Changes" section (only the document was edited).
- The review is limited to 2 rounds, so I do not do a third. There is no code change, so the previous `npm run check` result (exit 0) is valid. The merge is decided by the CI of the final head.
