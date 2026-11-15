# Re-prepare the local app DB and test DB in Docker (#178)

## Purpose

32 DB integration tests were skipped because the test DB setup was gone, and the app DB had never been started. The user chose a test DB in a Docker container on 2026-11-04 (#177), because it needs no administrator rights or Windows service.

## What was done (2026-11-15, local PC, not in the repository)

- #177: the user created `.env` from `.env.example` with a random password, the same value in `POSTGRES_PASSWORD` and `DATABASE_URL`.
- Started the app DB with `docker compose up -d --wait db` (port 15402) and applied migrations 001 to 019 with `npm run db:migrate -w backend`. `schema_migrations` has 19 rows.
- Created role and database `study_test` in the same container. Its random password went only into `%APPDATA%\postgresql\pgpass.conf` (`localhost:15402:study_test:study_test:...`) and was never printed.
- Applied migrations 001 to 019 to `study_test` with `DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate -w backend`.
- Set the user environment variable `TEST_DATABASE_URL=postgres://study_test@localhost:15402/study_test`. The old native `postgresql-17` service (port 5432) is stopped and no longer used.

## Changes

- `docs/next-steps/README.md`: removed the finished "Set the app DB password" row, renumbered the remaining items, and rewrote "Local environment status" for the Docker setup.

## Verification

- `npm test` with `TEST_DATABASE_URL` set: 426 backend tests, 426 passed, 0 failed, 0 skipped.
