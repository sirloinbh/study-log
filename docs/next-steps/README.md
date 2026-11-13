# Next steps

Last updated: **2026-11-04 (Asia/Seoul)**.

## What to do next

The agent proceeds in this order.

1. Ask whether the items under "What the user does by hand" below are done.
2. When the API key (#129) is ready, first check the real responses for #33 and try creating a schedule with real holidays (see "What the agent does after confirmation" below). This can be done with the test DB even if the app DB is not ready. Without a key, schedule creation on the real server is rejected with 503 and the screen shows the reason.
3. When the app DB password is set (item 1 below), apply the migrations to the app DB. For #28 (P2), the user must decide the storage location and the package installs. #29 and #30 (P3) are tied to #28.
4. Ask the user about "What the user decides" below.
5. If all of the above are blocked, do the items under "Issues that can be done without the API key and the app DB" in "Next issue candidates", in the order listed.

## What the user does by hand

These are steps the agent could not finish because they need administrator approval, a reboot, or an account login. When a new session starts, the agent asks the user whether the items below are done, before any other work.

| Order | Task                                                                                         | Status                                                                                                                                                                                                             | What the user does                                                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Set the app DB password                                                                      | Docker ran during the #146 work, but it returned an engine API 500 error during the #165 work on the same day (2026-11-03). `POSTGRES_PASSWORD` in the local `.env` is still the example value from `.env.example` | Change `POSTGRES_PASSWORD` in `.env` and the password in `DATABASE_URL` to the same new value. The value used when the app DB volume is first created stays in place, so decide it before you start it |
| 2     | Connect the Claude in Chrome extension account                                               | Not done. The extension (Chrome "Profile 1") and the native host work, but the list of connected browsers in Claude Code is empty                                                                                  | In the "Profile 1" window, check that the Claude extension is logged in to claude.ai with the same account as Claude Code, then reconnect with `/chrome` in Claude Code                                |
| 3     | [Get a Public Data Portal API key (#129)](https://github.com/sirloinbh/study-log/issues/129) | The user decided to do it later by hand. It is needed for creating schedules and for checking the real responses for #33                                                                                           | Apply for the Korea Astronomy and Space Science Institute special day information API and put the key in `HOLIDAY_API_KEY` in the local `.env`. When you deploy, put it in the server `.env` too       |

### What the user decides

Nothing right now. What the user decided on 2026-11-03:

- #165: remember the original date and restore it.
- The criteria for schedule statistics (chapter 7 of `docs/decisions/schedule-rules.md`): keep them as they are.
- Build the schedule name edit screen (#179) and the textbook filter for study time statistics (#180). #179 was merged on 2026-11-04, and #180 is built in PR #184, which also edited this sentence. Do not build a calendar view.

What the user decided on 2026-11-04:

- Prepare the test DB as a Docker container that does not need administrator rights ([#177 comment](https://github.com/sirloinbh/study-log/issues/177#issuecomment-6620502022)). #178 creates `study_test` this way. Item 1 above (the app DB password) and starting Docker Desktop are needed first.

### What the agent does after confirmation

- After item 1 is done:
  - Start the app DB (host port 15402) with `docker compose up -d db`, and apply the migrations with `docker compose run --rm --no-deps -v "$PWD/database/migrations:/database/migrations:ro" api node dist/migrate.js`, the same as the deployment. The behavior of this command was checked with a temporary compose project in #146. In Git Bash you must use `MSYS_NO_PATHCONV=1` and `$(pwd -W)` so the container paths are not rewritten
  - If needed, check the web (8102) and API behavior with `docker compose up -d`. Building the images needs `NODE_AUTH_TOKEN`. Locally, the build passed `gh auth token` of `sirloinbh`, which has the `read:packages` permission, only as a shell environment variable
- After item 2 is done:
  - Check that listing tabs (`tabs_context_mcp`) works with the Claude in Chrome tools
  - Record that screen change verification can now be done with the extension. Until then, it was verified with headless Chrome (the DevTools protocol)
- After item 3 is done:
  - Look up one year with the real key and check that the response matches how `backend/src/holidays.ts` interprets it. Check that substitute holidays and temporary holidays come back with `isHoliday: Y`, and look at the `items` shape of an empty month and the key error response. Check whether fixed holidays that fall on a weekend also appear in the response. `_type=json` is not in the official documentation, so this is when it is first confirmed.
  - Create a schedule with real holidays and check in the browser the amount for a period that has the Lunar New Year or Chuseok. So far it was checked only with holidays put into the test DB.
  - If the app DB (item 1 above) is not ready, use the test DB. `.env` needs only the key, and start it in PowerShell with `$env:DATABASE_URL=[Environment]::GetEnvironmentVariable('TEST_DATABASE_URL','User'); $env:PGPASSFILE="$env:APPDATA\postgresql\pgpass.conf"; npm run dev`. This is the same method as the browser check on 2026-11-01. This leaves rows in the test DB that `npm test` does not delete, so delete them from `schedules`, `holidays`, and `holiday_years` when you are done. If only `holiday_years` is left, the API is not called for 7 days and schedules are created without holidays.
- Remove finished items from this table and record them in the daily log.

## Local environment status

- In the #175 work on 2026-11-03, the test DB settings below (the environment variable, `pgpass.conf`, and the `postgresql-17` service) could not be found, so 32 DB integration tests were skipped. In the #165 work on the same day, all three were there, and the DB integration tests ran without skips. It can look different in each run environment, so if skips appear, check the three first.
- In the #165 work on the same day, `docker version` returned an engine API 500 error. Check that Docker Desktop is running.

- Native PostgreSQL 17.11: Windows service `postgresql-17`, port 5432, starts automatically.
- Migrations 001 to 019 are applied to the test-only DB `study_test` (owner `study_test`) (019 was applied on 2026-11-03 with `npm run db:migrate -w backend`, with `DATABASE_URL` pointed at the test DB). Before you apply a new migration, the integration tests that use its tables fail.
- With the user environment variable `TEST_DATABASE_URL=postgres://study_test@localhost:5432/study_test`, the DB integration tests of `npm test` run without skips. The password is only in `%APPDATA%\postgresql\pgpass.conf`.
- Added `C:\Program Files\PostgreSQL\17\bin` (`psql`) to the user PATH.
- To apply a new migration to the test DB (repository root, PowerShell): `$env:PGCLIENTENCODING='UTF8'; psql -h localhost -U study_test -d study_test -v ON_ERROR_STOP=1 -f database/migrations/NNN_<description>.sql`. If you do not set the client encoding to UTF8, it reads with the console code page and Korean text is garbled.
- The app DB (15402) is based on Docker Compose (`compose.yaml`). Use it after item 1 above.

## Next issue candidates

The rules follow the [study schedule](../decisions/schedule-rules.md) and [review interval](../decisions/review-rules.md) documents.

| Issue | Content                        | Priority | Note                                                  |
| ----- | ------------------------------ | -------- | ----------------------------------------------------- |
| #28   | PDF and image file upload base | P2       | Need to confirm storage location and package installs |

What can be done without the API key and the app DB: nothing right now. Register new requirements as issues or wait for the user steps above.

Close the parent issue #5 when #28, #29, and #30 are done.

## Execution boundary

Deployment, syncing the sub-repositories, and creating AWS resources are done only on separate request. Add the ECR repository of the shared infrastructure to the list in `shared-aws-infrastructure` at the first deployment.
