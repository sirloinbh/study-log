# #269 Make retrospective and stats summaries consistent

Issue: https://github.com/sirloinbh/study-log/issues/269

## Purpose

- The retrospective period summary left planned logs out of minutes, days and logs, but counted their goal flag in `goalsAchieved` and `goalsChecked`, so `goalsChecked` could exceed `logs`.
- `/api/stats/textbooks` ran two queries outside a transaction and called `today()` twice; `/api/stats/study-time` read totals and the daily series separately.

## Changes

- `backend/src/retrospectives.ts`: both goal counts now have `status <> 'planned'`.
- `backend/src/sql.ts`: new `inSnapshot(pool, run)`, a read-only `REPEATABLE READ` transaction.
- `backend/src/stats.ts`: `/study-time` and `/textbooks` run all their queries in one snapshot and read `today()` once. `dailyMinutes` takes a pool or a client. The 404 for an unknown textbook now ends the snapshot first and answers after it.
- Tests: `stats.test.ts` (fake pools now offer `connect`; new tests check the `REPEATABLE READ` statement and that `today()` is read once for `/textbooks`); `retrospectives.integration.test.ts` adds a planned log with `goalAchieved` and asserts `goalsChecked <= logs`.

## Verification

- `stats.test.ts` run locally. The retrospectives integration test needs `TEST_DATABASE_URL`, so it ran in CI only.
- `npm run check`: see the PR.

## Limits

- `/heatmap`, `/reviews` and `/patterns` each run one query, so they need no snapshot.
