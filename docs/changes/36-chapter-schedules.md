# #36 Create chapter-level schedules for a textbook

- Issue: [#36](https://github.com/sirloinbh/study-log/issues/36)
- Branch: `feat/36-chapter-schedules`
- Rules: chapter 2 of the [study schedule rules](../decisions/schedule-rules.md)

## Purpose

Assign study dates per chapter based on a textbook's table of contents. Assign more chapters to days with longer study time.

## Changes

- `database/migrations/016_schedule_chapters.sql`: `schedules.textbook_id`, `schedule_item_contents`.
- `backend/src/schedules.ts`:
  - `chapterDays`: the allocation calculation of rule chapter 2. It compares with integers to avoid fraction errors.
  - `POST /api/schedules` takes `chapters` (textbook, first chapter, last chapter) and assigns chapters to items.
  - Added the textbook and the chapters per item to the lookup response.
- `backend/src/textbooks.ts`, `backend/src/textbook-contents.ts`: added schedules to the delete refusal message.
- `frontend/src/schedules.tsx`: added textbook, first chapter, and last chapter selection to the form, and show chapters in the list by date.

## Implementation judgment

- A textbook and chapters linked to a schedule cannot be deleted. It is the same way as study records, and deleting would silently drop the schedule's assignment. If you delete the schedule, they can be deleted again.
- The range is checked before the holiday lookup, so a wrong input does not call the API. Inside the transaction it locks the textbook row and reads again, so a table of contents change in between is reflected too.
- The assignment of a schedule already created is not recalculated even if the table of contents changes.
- The textbook is optional. If you do not pick one, it creates a schedule with time only, like #34 and #35.

## Review

The first review found no defects that had to be blocked. I fixed the following.

- If you reordered the table of contents, the order of chapters on the same day flipped. I save the order at assignment time in `position`. 016 was not merged yet, so I edited that file, and in the test DB I deleted 016 and applied it again.
- Submitting before reading the table of contents or in a state where it could not be read created a whole-book schedule. Since the range cannot be fixed after creation, I block the submit.
- I strengthened tests that passed even when the code was broken: the re-check and lock inside the transaction, the range of a book whose order was changed, a late response while changing the textbook, and boundaries that go wrong with fractions.

The second review also found no defects that had to be blocked, and I fixed 2. The review is limited to 2 rounds, so I did no further review.

- If you picked the same textbook again, it got past the submit block with the table of contents read before. I clear the table of contents read when you pick a textbook.
- If the lock test failed, a transaction could be left or the test could hang. It now ends and returns the connection in every case.

## Not confirmed

There was no API key (#129), so I could not create a schedule with the real holiday API. The browser check was done by temporarily putting the 2026 holidays into the test DB, and I deleted them afterward.

## Verification

`npm run check` with `TEST_DATABASE_URL` set passed. Backend 395, frontend 180, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards. I applied migration 016 to the test DB.

I checked with headless Chrome at PC 1440×900 and mobile 390×844. 24 items passed and I looked at the screenshots myself. The example in the rules document (2, 2, 2, 2, 2, 5, 5 hours, 4 chapters) comes out as it is, picking a range shows only those chapters, and a range picked backward is rejected. Deleting a textbook used in a schedule is blocked with 409. There is no horizontal scroll even with a long chapter title.

I deliberately broke the allocation and range calculation in 11 ways and confirmed that the tests catch all, then reverted. At first the "no lock" variant was not caught. The test depended on a 150ms wait, so the pre-check could reject in its place. I fixed it to commit after confirming the request is waiting on the lock, and confirmed it is caught.

When I ran the full check at the same time as other work, 2 tests in `app.test` failed (a 5 second timeout and then an element lookup failure after it, 80 seconds in total), and they passed when re-run alone (12 seconds). It looks like tests that are weak under load, and measuring the cause is done together in #160.

## Tests

- `backend/test/schedule-chapters.test.ts`: the example in the rules, exactly on a boundary and over it, when there are more chapters than days and fewer, integer comparison, and all chapters come out in order and end on the last day.
- `backend/test/schedule-chapters.integration.test.ts`: the whole book and a range, a day with an amount of 0, a schedule with no textbook, a wrong range rejected before the holiday lookup, refusing to delete a textbook and chapters used in a schedule, a chapter added later is not assigned, and a textbook can be deleted once the schedule is deleted.
- `frontend/src/schedules.test.tsx`: no textbook, the whole book, a range, changing the textbook clears the range, a book with no chapters, when the table of contents and the textbook list cannot be read, and the textbook name in the list.
