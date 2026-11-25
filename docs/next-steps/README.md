# Next steps

Last updated: **2026-11-26 (Asia/Seoul)**.

## What to do next

The agent proceeds in this order.

1. Ask whether the items under "What the user does by hand" below are done.
2. What was built on 2026-11-23/24 (the four-lane run) is in [the daily note](../daily/2026-11-23.md). Everything is merged to `main`; nothing is deployed. The code review fixes, the TanStack Query move, the design changes, exercise practice, study timer and goals, flashcards, export, Claude drafts and feedback, and the coding problem log are all done. Open issues: #250, #221, #249, #288 (deployment and platform), and #354, #367 (calendar sync setup).
   The second run (2026-11-24) is in [its daily note](../daily/2026-11-24.md): Google Calendar sync (#366, #403), reminder email through AWS SES (#365), the exercise review rebuild (#393) and lane 4's screen fixes. Also merged and not deployed. The #365 merge added a package (`@aws-sdk/client-sesv2`), so every checkout needs `npm ci`.
3. The earlier state still holds: the holiday API key (#129) is in AWS SSM (`/sirloinbh/shared/data-go-kr-service-key`); #28 (S3 storage and upload API) and #209 are merged; #30 reads problems and answers from a PDF or photo with Claude ([extraction rules](../decisions/extraction-rules.md)), and a first real call on generated sample pages worked on 2026-11-17 (`docs/changes/30-file-extraction.md`). Real textbook scans and phone photos are not checked yet. Real S3 uploads need `FILE_BUCKET`, `AWS_REGION` and credentials.
4. Ask the user about "What the user decides" below.
5. Nothing else can be built until the user items are done; register new requirements as issues.

## What the user does by hand

These are steps the agent could not finish because they need administrator approval, a reboot, an account login, or a real server. When a new session starts, the agent asks the user whether the items below are done, before any other work.

| Order | Task                                                | Status                                                                                                                                                                                                                                                                      | What the user does                                                                                                                                                                                                                                                                                                                 |
| ----- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Connect the Claude in Chrome extension account      | Not done. The extension (Chrome "Profile 1") and the native host work, but the list of connected browsers in Claude Code is empty                                                                                                                                           | In the "Profile 1" window, check that the Claude extension is logged in to claude.ai with the same account as Claude Code, then reconnect with `/chrome` in Claude Code                                                                                                                                                            |
| 2     | #250 [Manual] First deployment to the shared server | Not done. Add the ECR repository to the list in `shared-aws-infrastructure` first. The first deploy's migrate step applies migrations 021 to 035 (022 `schedule_chapter_textbook_match` is part of it; 033 calendar sync, 034 reminder sends, 035 calendar exercise review) | SSH to the server, create `.env`, run the first deploy, set up the timers. Items 3 to 9 need this first                                                                                                                                                                                                                            |
| 3     | #221 check the shared sign-in                       | Code is on `main`                                                                                                                                                                                                                                                           | After #250, check on the server that a signed-out visitor is sent to the sign-in page, then close #221                                                                                                                                                                                                                             |
| 4     | #268 proxy check                                    | Claude calls have a time budget (PR #324), and the user chose to raise the shared nginx `/api/` read timeout to 300 s in project-standards                                                                                                                                  | After #250, check that the shared proxy in front of study-log.daysofme.com allows a 300 s `/api/` response                                                                                                                                                                                                                         |
| 5     | #335 orphaned-file sweep                            | The sweep (`npm run files:sweep -w backend`) is built; a dry run is the default                                                                                                                                                                                             | Run `npm run files:sweep -w backend -- --apply` against the real bucket (it deletes production objects), and add `s3:ListBucket` for the app role in `shared-aws-infrastructure` if the sweep needs it                                                                                                                             |
| 6     | #369 and #370 real imports                          | Tested with fakes only. A plain request from the Mac to solved.ac got a Cloudflare 403. LeetCode's recent list is believed to be capped at about 20                                                                                                                         | Set `SOLVEDAC_HANDLE` and `LEETCODE_USERNAME` on the server (not secrets), then try one lookup and one import of each on the Coding page                                                                                                                                                                                           |
| 7     | #362 and #363 real Claude calls                     | No real call was made; they need `ANTHROPIC_API_KEY` on the server                                                                                                                                                                                                          | After #250, try one retrospective draft and one feedback on an exercise attempt                                                                                                                                                                                                                                                    |
| 8     | Real-server screen check                            | Lane browser checks ran on Vite with a mocked `/api`, never with a real database                                                                                                                                                                                            | After #250, look at all screens at 390x844 and 1440x900, including the new ones: coding log, wrong exercises, flashcards, timer, weekly goal, export, exercise attempts, and the Google Calendar card on Settings                                                                                                                  |
| 9     | #367 then #366 calendar sync                        | #367 [Manual] needs a Google Cloud OAuth client. #366 (PR #398) and #403 (PR #407) are built and tested only against a stand-in `fetch`, never real Google                                                                                                                  | Create the OAuth client with the redirect URI `https://<site>/api/calendar-sync/callback`. After #250, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` and `CALENDAR_TOKEN_KEY` (`openssl rand -base64 32`) in the server `.env`. Then Settings, Connect Google Calendar, Sync now, and look at the calendar |
| 10    | #365 reminder email                                 | Built with a fake sender (PR #400); the user chose AWS SES, one email at 08:00 Asia/Seoul on a day with reviews due. No real send yet                                                                                                                                       | Verify a sender address in AWS SES, allow `ses:SendEmail` for the server role, set `REMINDER_EMAIL_TO`, `REMINDER_EMAIL_FROM` (and `SES_REGION` if it differs from `AWS_REGION`) in the server `.env`. An SES sandbox account sends only to verified addresses. Then check one email                                               |

### What the user decides

Nothing right now. What the user decided on 2026-11-24 and 2026-11-26 is in [the daily note](../daily/2026-11-24.md) and on each issue (SES email, one-way calendar sync, review rebuild, 13px heatmap labels, lanes kept open).

What the user decided on 2026-11-03:

- #165: remember the original date and restore it.
- The criteria for schedule statistics (chapter 7 of `docs/decisions/schedule-rules.md`): keep them as they are.
- Build the schedule name edit screen (#179) and the textbook filter for study time statistics (#180). #179 was merged on 2026-11-04, and #180 is built in PR #184, which also edited this sentence. Do not build a calendar view.

What the user decided on 2026-11-04:

- Prepare the test DB as a Docker container that does not need administrator rights ([#177 comment](https://github.com/sirloinbh/study-log/issues/177#issuecomment-6620502022)). #178 created `study_test` this way on 2026-11-15.

### What the agent does after confirmation

- After item 1 is done:
  - Check that listing tabs (`tabs_context_mcp`) works with the Claude in Chrome tools
  - Record that screen change verification can now be done with the extension. Until then, it was verified with headless Chrome (the DevTools protocol)
- Remove finished items from this table and record them in the daily log.

## Local environment status

As of 2026-11-15 (#177, #178), both DBs run in the Docker Compose `db` container (PostgreSQL 17, host port 15402). Docker Desktop must be running; if DB integration tests are skipped or cannot connect, start it and run `docker compose up -d db`.

- App DB `study` (user `study`): the password is in the local `.env` (`POSTGRES_PASSWORD` and `DATABASE_URL`). Migrations 001 to 020 were applied on 2026-11-17 with `npm run db:migrate -w backend`; 021 to 035 (added on 2026-11-23/24) are not recorded as applied here, so run it again before using the new screens locally.
- Test DB `study_test` (owner `study_test`) in the same container. Migrations 001 to 020 were applied; 021 to 035 need the command below. The user environment variable is `TEST_DATABASE_URL=postgres://study_test@localhost:15402/study_test`, and the password is only in `%APPDATA%\postgresql\pgpass.conf`. With it, `npm test` ran 444 backend tests with 0 skipped (2026-11-16).
- To apply a new migration to the test DB (repository root, Git Bash): `DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate -w backend`. Before you apply it, the integration tests that use its tables fail.
- The native Windows service `postgresql-17` (port 5432) from earlier work is stopped and no longer used.

## Next issue candidates

The rules follow the [study schedule](../decisions/schedule-rules.md), [review interval](../decisions/review-rules.md) and [text extraction](../decisions/extraction-rules.md) documents.

No candidates are open besides the user items above. The upload limit (project-standards#589) was raised to 21 MB for `/api/` on 2026-11-17 (PR #233, checked in `docs/changes/234-upload-limit-check.md`).

What can be done without user input: nothing right now. Register new requirements as issues or wait for the user steps above.

The parent issue #5 is closed with #30 (#28, #29, #209 and #30 all done).

## Execution boundary

Deployment, syncing the sub-repositories, and creating AWS resources are done only on separate request. Add the ECR repository of the shared infrastructure to the list in `shared-aws-infrastructure` at the first deployment.
