# Next steps

Last updated: **2026-11-15 (Asia/Seoul)**.

## What to do next

The agent proceeds in this order.

1. Ask whether the items under "What the user does by hand" below are done.
2. When the API key (#129) is ready, first check the real responses for #33 and try creating a schedule with real holidays (see "What the agent does after confirmation" below). Without a key, schedule creation on the real server is rejected with 503 and the screen shows the reason.
3. For #28 (P2), the user must decide the storage location and the package installs. #29 and #30 (P3) are tied to #28. The app DB and the test DB are ready (#177, #178, 2026-11-15).
4. Ask the user about "What the user decides" below.
5. If all of the above are blocked, do the items under "Issues that can be done without the API key and the app DB" in "Next issue candidates", in the order listed.

## What the user does by hand

These are steps the agent could not finish because they need administrator approval, a reboot, or an account login. When a new session starts, the agent asks the user whether the items below are done, before any other work.

| Order | Task                                                                                         | Status                                                                                                                            | What the user does                                                                                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Connect the Claude in Chrome extension account                                               | Not done. The extension (Chrome "Profile 1") and the native host work, but the list of connected browsers in Claude Code is empty | In the "Profile 1" window, check that the Claude extension is logged in to claude.ai with the same account as Claude Code, then reconnect with `/chrome` in Claude Code                          |
| 2     | [Get a Public Data Portal API key (#129)](https://github.com/sirloinbh/study-log/issues/129) | The user decided to do it later by hand. It is needed for creating schedules and for checking the real responses for #33          | Apply for the Korea Astronomy and Space Science Institute special day information API and put the key in `HOLIDAY_API_KEY` in the local `.env`. When you deploy, put it in the server `.env` too |

### What the user decides

Nothing right now. What the user decided on 2026-11-03:

- #165: remember the original date and restore it.
- The criteria for schedule statistics (chapter 7 of `docs/decisions/schedule-rules.md`): keep them as they are.
- Build the schedule name edit screen (#179) and the textbook filter for study time statistics (#180). #179 was merged on 2026-11-04, and #180 is built in PR #184, which also edited this sentence. Do not build a calendar view.

What the user decided on 2026-11-04:

- Prepare the test DB as a Docker container that does not need administrator rights ([#177 comment](https://github.com/sirloinbh/study-log/issues/177#issuecomment-6620502022)). #178 created `study_test` this way on 2026-11-15.

### What the agent does after confirmation

- After item 1 is done:
  - Check that listing tabs (`tabs_context_mcp`) works with the Claude in Chrome tools
  - Record that screen change verification can now be done with the extension. Until then, it was verified with headless Chrome (the DevTools protocol)
- After item 2 is done:
  - Look up one year with the real key and check that the response matches how `backend/src/holidays.ts` interprets it. Check that substitute holidays and temporary holidays come back with `isHoliday: Y`, and look at the `items` shape of an empty month and the key error response. Check whether fixed holidays that fall on a weekend also appear in the response. `_type=json` is not in the official documentation, so this is when it is first confirmed.
  - Create a schedule with real holidays and check in the browser the amount for a period that has the Lunar New Year or Chuseok. So far it was checked only with holidays put into the test DB.
  - Use the app DB: start Docker Desktop, then `docker compose up -d db` and `npm run dev` (both read `.env`).
- Remove finished items from this table and record them in the daily log.

## Local environment status

As of 2026-11-15 (#177, #178), both DBs run in the Docker Compose `db` container (PostgreSQL 17, host port 15402). Docker Desktop must be running; if DB integration tests are skipped or cannot connect, start it and run `docker compose up -d db`.

- App DB `study` (user `study`): the password is in the local `.env` (`POSTGRES_PASSWORD` and `DATABASE_URL`). Migrations 001 to 019 are applied (`npm run db:migrate -w backend`).
- Test DB `study_test` (owner `study_test`) in the same container. Migrations 001 to 019 are applied. The user environment variable is `TEST_DATABASE_URL=postgres://study_test@localhost:15402/study_test`, and the password is only in `%APPDATA%\postgresql\pgpass.conf`. With it, `npm test` ran 426 backend tests with 0 skipped.
- To apply a new migration to the test DB (repository root, Git Bash): `DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate -w backend`. Before you apply it, the integration tests that use its tables fail.
- The native Windows service `postgresql-17` (port 5432) from earlier work is stopped and no longer used.

## Next issue candidates

The rules follow the [study schedule](../decisions/schedule-rules.md) and [review interval](../decisions/review-rules.md) documents.

| Issue | Content                        | Priority | Note                                                  |
| ----- | ------------------------------ | -------- | ----------------------------------------------------- |
| #28   | PDF and image file upload base | P2       | Need to confirm storage location and package installs |

What can be done without the API key and the app DB: nothing right now. Register new requirements as issues or wait for the user steps above.

Close the parent issue #5 when #28, #29, and #30 are done.

## Execution boundary

Deployment, syncing the sub-repositories, and creating AWS resources are done only on separate request. Add the ECR repository of the shared infrastructure to the list in `shared-aws-infrastructure` at the first deployment.
