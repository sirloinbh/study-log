# #134 Fix the migration step of the deployment script

- Issue: [#134](https://github.com/sirloinbh/study-log/issues/134)
- Branch: `fix/134-migrate-entry`

## Purpose

The centrally managed file `deploy/remote-deploy.sh` runs `node dist/migrate.js`, but this app had no source for it. From the first deployment, it would have failed at the migration step.

## Changes

- `backend/src/migrations.ts`, `backend/src/migrate.ts`: a tool that applies only the files not applied yet. It follows the implementation of `workout-memo`, which uses the same central standard. I left out the unused `--status` feature and fixed the comments to match this app's instructions.
- `backend/package.json`: `npm run db:migrate`.
- `database/README.md`: the procedure for applying.

## Decisions

- It uses the history table `schema_migrations` and checksums. If a file that was already applied changes, it refuses.
- An existing DB without the history table runs all files once more on the first run. The 12 migrations in this repository are safe to re-run with `IF NOT EXISTS` and the like, and I confirmed that with integration tests.

## Tests

- `backend/test/migrations.test.ts`: checksums, computing pending files, refusing a history mismatch, and checking file names and numbers.
- `backend/test/migrations.integration.test.ts`: applying everything to an empty schema, no change on re-run, keeping data in an existing DB without history, refusing a changed file, and rolling back only the failed file.

## Review

In the first review there was no defect that would wrongly let a deployment pass, and I fixed the following in this PR.

- The constraint guards in 005 and 006 did not tell schemas apart, so 5 constraints were silently skipped in a test schema. I added `conrelid = 'study_logs'::regclass` to the guards and test that the constraints exist. No DB has recorded them yet, so this file can be fixed now. I deleted the records left in the local test DB.
- The DB healthcheck in `compose.yaml` checked through a socket, so if it passed during the initialization of a new volume, the TCP connection of the next step could fail. I changed it to `pg_isready -h 127.0.0.1`. I could not run it because there is no Docker.
- If the connection dropped, the process died without the failed file name. I use `createPool`, and made a failure to release the lock not cover the original error.
- I matched the procedures in `database/README.md` and `docs/project-setup.md` to the real behavior.

An existing problem, where `compose.yaml` does not keep the image tag and port assumptions of the deployment script so rollback does not work, was split into [#146](https://github.com/sirloinbh/study-log/issues/146).

In the second review, the following were fixed in this PR. The review is limited to 2 rounds, so I did not do a third review.

- When the connection to `localhost` was refused, the message was an empty error so only a blank line remained. It now tells `DB에 연결할 수 없습니다 (ECONNREFUSED)` ("Cannot connect to the DB (ECONNREFUSED)"), and I confirmed by running against a closed port.
- In `docs/next-steps/README.md`, I removed the finished #133 and wrote the order of #146 and #142.
- I reflected the fixed healthcheck in the Compose template in `docs/project-setup.md` too.

## Verification

- `npm run check` with `TEST_DATABASE_URL` set passed. Backend 325, frontend 100, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards.
- I ran the built `backend/dist/migrate.js` against the existing test DB. The first run applied 12, and the second ended with "적용할 마이그레이션이 없습니다" ("There are no migrations to apply"). Without `DATABASE_URL`, it prints a message and fails. After the review fixes, I confirmed the same result with `npm run db:migrate -w backend`.
- **I could not check the real deployment flow.** Docker does not run on this PC (SVM Mode is off in the BIOS), so I could not run `docker compose run … api node dist/migrate.js`. I only confirmed in the code that in the container, `../../database/migrations` from `/app/dist` leads to the `/database/migrations` mount. It needs to be checked after Docker is turned on.
