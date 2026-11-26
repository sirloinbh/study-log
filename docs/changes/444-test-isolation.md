# Make the stats and calendar-sync integration tests independent of other test files (#444)

## Purpose

`stats.integration` and `calendar-sync.integration` failed intermittently when the integration files ran in parallel on one test DB (4 of 4 full backend runs on a fresh DB had one of the two fail), and passed in CI mostly by timing.

## Cause

Both count over the whole DB, and other files write to it at the same moment.

- Stats sums every study log dated up to its "today" (2096-05-16). Several files insert logs dated 2026, 2040 or 2093 (`exercise-attempts`, `exercise-files`, `ai-tools`, `retrospective-draft`, `migrations`) and do not take the advisory lock the stats test holds, so a row appeared between the baseline reads (`0 !== 25`).
- The calendar sync test runs a sync that reads every schedule item and review in the DB, and its cleanup deleted all `calendar_events` and `calendar_connection` rows, so another file's rows added events or were deleted under it (`17 !== 16`).

## Changes

| File                                             | Change                                                                                                                                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/test/helpers.ts`                        | New `isolatedSchema` and `isolatedPool`: a schema of its own with all migrations applied (as `migrations.integration` already does), a Pool whose connections use it, and a drop when the test ends. |
| `backend/test/stats.integration.test.ts`         | Both tests run in their own schema; the advisory lock and the date-range cleanups are gone.                                                                                                          |
| `backend/test/calendar-sync.integration.test.ts` | The main test runs in its own schema; the global deletes are gone.                                                                                                                                   |

`holdExactTotalsLock` stays for the other files that use it.

## Verification

- Before: 4 full `npm test -w backend` runs on a throwaway Postgres 17 (port 15492): each had exactly one of the two tests fail.
- After: 6 full runs in a row on the same reused DB: 423 of 423 passed each time; no `iso_*` schema is left behind.
