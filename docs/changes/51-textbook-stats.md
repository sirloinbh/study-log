# #51 Per-textbook progress and schedule achievement and adherence rates

- Issue: [#51](https://github.com/sirloinbh/study-log/issues/51)
- Branch: `feat/51-textbook-stats`
- Rules: chapter 7 of the [study schedule rules](../decisions/schedule-rules.md)

## Purpose

Show progress by textbook and by schedule as statistics.

## Changes

- `database/migrations/018_schedule_item_original_date.sql`: `schedule_items.original_date`. Existing items are filled with the current date.
- `backend/src/stats.ts`: `GET /api/stats/textbooks?textbookId=`. Completed chapters and total chapters per textbook, and the schedule achievement and adherence rates.
- `backend/src/schedules.ts`: saves the original date when an item is created.
- `frontend/src/textbook-stats.tsx`: the "Textbooks and schedules" card and the textbook filter on the statistics screen.

## Implementation judgment

The criteria the issue did not define are written in chapter 7 of the rules.

- A completed chapter is one that has at least one completed study record in the chapter or in a section under it. The completion check of a schedule and the study records are not linked, so a textbook's progress is counted from study records.
- The achievement rate is based on target time, and the adherence rate is based on the number of items. Adherence is about whether the date was kept, so it is not weighted by time.
- Automatic pushing changes the current date, so I added a column because the original date is needed to count the adherence rate.
- Today's item that is not finished yet is not late, so it is not counted. Not counting it as late is the same as the review statistics, and removing it from the denominator too is different. This is so the achievement rate of a schedule that started today does not come out low right away.

## Review

The first review found no blocking defects. I fixed the following.

- With a long textbook title, the filter could overflow the card and create a horizontal scroll on the screen.
- A completion record with a future date was counted as a completed chapter. Like the other statistics, only records before today are counted.
- If the first request failed, there was no way to recover the card. I added "다시 불러오기" ("Reload").
- I added tests: whether the card is on the statistics screen, an abandoned record, cancelling a completion, and a bad query.
- I corrected the explanation "the same way as the review statistics".

There are points to know about as results of the rules. If the user decides to change them, fix chapter 7 of the rules.

- Automatic pushing moves all incomplete items, so even if you miss only the first day and then finish every day as the screen shows, every item is one day later than its original date, and the adherence rate can drop to 0%. The achievement rate is 100%.
- Finishing even one section makes its chapter complete, and if you only tick the schedule's completion and have no study record, it is 0 chapters.
- An item finished early is not included in the achievement rate until its original date comes. It can differ from the progress on the schedule screen (#38).

## Not confirmed

There was no API key (#129), so I could not create a schedule with the real holiday API. The browser check was done by temporarily putting the 2026 holidays into the test DB, and I deleted them afterward.

If a schedule was created before this feature was added, its original date becomes the date at the time of the migration. It is not deployed yet, so no real schedule is affected.

## Verification

`npm run check` with `TEST_DATABASE_URL` set passed. Backend 422, frontend 201, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards. I applied migration 018 to the test DB.

I checked with headless Chrome at PC 1440×900 and mobile 390×844. 16 items passed and I looked at the screenshots myself. I looked at the completed chapters bar, a textbook with no table of contents, the achievement and adherence rates, the textbook filter, and no horizontal scroll even with a 200-character textbook title.

## Tests

- `backend/test/textbook-stats.integration.test.ts`: the completion check of chapters and sections, duplicate records, records that are not completed, when there are no counted items, counting by the original date even with automatic pushing and manual moves, an item finished late, the textbook filter, and a wrong textbook.
- `frontend/src/textbook-stats.test.tsx`: the path and rounding down, the bar and figures, the filter, when there is no rate, failure, and a late response.
