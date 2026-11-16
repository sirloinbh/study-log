# #231 Record that migration 020 is on the app DB

- Issue: [#231](https://github.com/sirloinbh/study-log/issues/231)
- Branch: `docs/231-migration-020-applied`

## Purpose

The user asked to apply migration 020 to the app DB on 2026-11-17. The next-steps page and the daily note still said it was pending.

## What was done

- `npm run db:migrate -w backend` printed `Applied: 020_exercise_files.sql`. The shell had no `DATABASE_URL`, so the tool used the app DB from `.env`.
- Checked with `docker compose exec db psql -U study -d study`: before, 19 rows in `schema_migrations` (last `019_schedule_item_reopened.sql`) and no `exercise_files`; after, 20 rows (last `020_exercise_files.sql`) and `exercise_files` exists.

## Changes

- `docs/next-steps/README.md`: the app DB has migrations 001 to 020.
- `docs/daily/2026-11-17.md`: the migration is listed under "Checked" and removed from "Not confirmed"; PR #230 linked.

## Verification

- `npm run check` (2026-11-17, `TEST_DATABASE_URL` set to the Docker test DB): exit 0. Backend 444 passed, 0 skipped; frontend 234 passed, 2 skipped; other suites 4 passed.

## Review

- Round 1 (self-review of the diff): no findings. The row counts and table check match the `psql` output above.
