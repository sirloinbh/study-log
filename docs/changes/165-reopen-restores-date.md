# #165 Make undoing a completion cancel return the item to its original date

- Issue: [#165](https://github.com/sirloinbh/study-log/issues/165)
- Branch: `fix/165-reopen-restores-date`

## Purpose

When you un-complete an item with a past date, it moves to today, and even if you complete it again its date did not come back. So if you un-checked by mistake once, the lateness mark stayed. On 2026-11-03, the user chose "remember the original date and restore it".

## Changes

- `database/migrations/019_schedule_item_reopened.sql`: added `reopened_from` (the date before the cancel) and `reopened_completed_on` (the completion date before the cancel) to `schedule_items`. A constraint makes both present or both absent.
- `backend/src/schedules.ts`:
  - Cancel a completion: if the item has a past date, move it to today and remember the date and completion date before the cancel. Items with today's or a later date are not moved, so nothing is remembered.
  - Complete: if there is a remembered value, restore that date and completion date and clear the memory. If not, set today as the completion date as before.
  - Move by hand: clear the memory of the moved item (including moving later items together). This is because the user set a new date.
- `docs/decisions/schedule-rules.md`:
  - Added this rule to chapter 4.
  - Wrote the user's decision (2026-11-03) in chapter 7 to keep the statistics criteria as they are.
- `docs/next-steps/README.md`: changed "what to decide" to the decision result, and wrote the new issues #179 and #180 and the test DB state.

## Implementation judgment

- The completion date is restored too. The adherence rate is counted from the completion date and the original date (chapter 7), so if only the date were restored, the adherence rate changed by mistake would remain.
- If a day passes while it is cancelled, that item becomes the earliest incomplete item and other incomplete items are pushed by automatic pushing (chapter 4). If you complete it again, that item goes back, but the items pushed along with it are not restored. This is because the push in between cannot be told apart from dates moved by hand. If you complete it again on the same day, nothing is pushed.
- I did not change the screen. When you complete it again, the list is redrawn with the dates the server returns.

## Tests

I added `completing a day reopened from the past puts it back (#165)` to `backend/test/schedule-adjust.integration.test.ts`. It checks the following four cases.

- If you complete 12-01 to 12-03 all, and on 12-20 cancel the first item, the lateness becomes 17 days. If you complete it again, it goes back to 12-01 with completion date 12-01, and the lateness becomes 0.
- Even if it is pushed to 12-22 by automatic pushing while cancelled, completing it again returns it to 12-01.
- If you move it by hand to 12-25 after cancelling, completing it again leaves it at 12-25, and the completion date becomes that day (12-22).
- An item moved together with the later schedule loses the memory too.

When I ran this file with the code before the fix, only the new test failed (`actual: '8041-12-20'`). After the fix it passed.

## Verification

- I ran `npm run db:migrate -w backend` with `DATABASE_URL` pointed at the test DB. The result was "적용 완료: 019_schedule_item_reopened.sql" ("Applied: 019_schedule_item_reopened.sql").
- `npm run check` with `TEST_DATABASE_URL` set: passed (exit 0).
  - Backend 424 passed (0 failed, 0 skipped).
  - Frontend 201 passed, 2 skipped (the dark-only app tests from the central standards).
  - Skills 4 passed.

I could not apply it to the app DB. During this work, `docker version` returned an engine API 500 error.

## Review

In the first review there were no defects in the code or the migration. I fixed the following two comments in this PR.

- "Docker runs" in the table in `docs/next-steps/README.md` did not match the 500 error record below it. I changed the status cell to the observations of the two works.
- There was no test for cancelling an item with today's or a future date and completing it again on another day. In this case there is nothing to remember, so that day must become the completion date.
  - I added this case to "reopening a day in the past brings only that day to today".
  - I confirmed that this test fails if you change the cancel condition to `<=` or remove the condition (18 passed and 2 failed in each). With the original code, 20 passed and 0 failed.

In the second review I confirmed that the two first-round comments were applied, and I reasoned through the expected values of the added tests by the code behavior and confirmed they are right. No defects remained.
