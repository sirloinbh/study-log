# Next steps

Last updated: **2026-11-16 (Asia/Seoul)**.

## What to do next

The agent proceeds in this order.

1. Ask whether the items under "What the user does by hand" below are done.
2. The API key (#129) is in AWS SSM (`/sirloinbh/shared/data-go-kr-service-key`) since 2026-11-15. `node tools/app-secrets.mjs pull study-log` in project-standards writes it into the local `.env`, and the server deploy reads it from SSM. The real responses and a Seollal 2027 schedule were checked on 2026-11-15 ([#33 comments](https://github.com/sirloinbh/study-log/issues/33)); no code change was needed.
3. #28 (S3 storage and upload API, decisions in the [#28 comments](https://github.com/sirloinbh/study-log/issues/28)) and #209 (stored files removed with their exercise, chapter, or textbook) were merged on 2026-11-15. Next is #29 (P3): the user decides the OCR method. #30 (P3) follows #29. Real S3 uploads need `FILE_BUCKET`, `AWS_REGION` and credentials in `.env`.
4. Ask the user about "What the user decides" below.
5. If all of the above are blocked, do the items under "Issues that can be done without the API key and the app DB" in "Next issue candidates", in the order listed.

## What the user does by hand

These are steps the agent could not finish because they need administrator approval, a reboot, or an account login. When a new session starts, the agent asks the user whether the items below are done, before any other work.

| Order | Task                                           | Status                                                                                                                            | What the user does                                                                                                                                                      |
| ----- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Connect the Claude in Chrome extension account | Not done. The extension (Chrome "Profile 1") and the native host work, but the list of connected browsers in Claude Code is empty | In the "Profile 1" window, check that the Claude extension is logged in to claude.ai with the same account as Claude Code, then reconnect with `/chrome` in Claude Code |

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
- Remove finished items from this table and record them in the daily log.

## Local environment status

As of 2026-11-15 (#177, #178), both DBs run in the Docker Compose `db` container (PostgreSQL 17, host port 15402). Docker Desktop must be running; if DB integration tests are skipped or cannot connect, start it and run `docker compose up -d db`.

- App DB `study` (user `study`): the password is in the local `.env` (`POSTGRES_PASSWORD` and `DATABASE_URL`). Migrations 001 to 019 are applied; apply 020 (`exercise_files`, #28) with `npm run db:migrate -w backend` before using uploads in the app.
- Test DB `study_test` (owner `study_test`) in the same container. Migrations 001 to 020 are applied. The user environment variable is `TEST_DATABASE_URL=postgres://study_test@localhost:15402/study_test`, and the password is only in `%APPDATA%\postgresql\pgpass.conf`. With it, `npm test` ran 435 backend tests with 0 skipped (2026-11-16).
- To apply a new migration to the test DB (repository root, Git Bash): `DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate -w backend`. Before you apply it, the integration tests that use its tables fail.
- The native Windows service `postgresql-17` (port 5432) from earlier work is stopped and no longer used.

## Next issue candidates

The rules follow the [study schedule](../decisions/schedule-rules.md) and [review interval](../decisions/review-rules.md) documents.

| Issue | Content                           | Priority | Note                                                                                                                                                  |
| ----- | --------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| #29   | Decide the OCR extraction method  | P3       | Needs the user's choice of method                                                                                                                     |
| —     | nginx 1 MB body limit for uploads | —        | Centrally managed `frontend/nginx.conf`: [project-standards#589](https://github.com/sirloinbh/project-standards/issues/589), before deploying uploads |

What can be done without user input: nothing right now. Register new requirements as issues or wait for the user steps above.

Close the parent issue #5 when #29 and #30 are done (#28 and #209 merged).

## Execution boundary

Deployment, syncing the sub-repositories, and creating AWS resources are done only on separate request. Add the ECR repository of the shared infrastructure to the list in `shared-aws-infrastructure` at the first deployment.
