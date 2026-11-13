# #37 Schedule completion check and delay and catch-up adjustments

- Issue: [#37](https://github.com/sirloinbh/study-log/issues/37)
- Branch: `feat/37-schedule-adjust`
- Rules: chapter 4 of the [study schedule rules](../decisions/schedule-rules.md)

## Purpose

Adjust the schedule as progress goes. A delayed schedule is pushed automatically when it is read.

## Changes

- `database/migrations/017_schedule_item_completion.sql`: `schedule_items.completed_on`.
- `backend/src/schedules.ts`:
  - `moveOverdue`, `catchUp`: if there are incomplete items on dates earlier than today, push all incomplete items by the same number of days. It is applied in a per-schedule transaction when the list and the detail are read.
  - `POST /api/schedules/:id/items/:itemId/complete`, `.../reopen`: completing and cancelling a completion.
  - `PUT /api/schedules/:id/items/:itemId/date`: moving an item. With `withLater`, the incomplete items on or after that date are moved together.
  - Added `currentEndDate`, `delayDays`, and the item's `completedOn` to the response.
- `frontend/src/schedules.tsx`: the completion check by date, the move form, and showing the number of days delayed.

## Implementation judgment

- If there is no item to push, it reads with no lock and no write. Only when there is an item to push does it lock the schedule row and recalculate, so even if read concurrently, it pushes only once.
- An item change locks the schedule row, pushes first, and then applies. This is to act based on the dates shown on the screen.
- The dates an item can be moved to are within 730 days of today (rule chapter 4).
- It does not read the holidays again. Even if the day it moves to is a weekday, it does not change the target time (rule chapter 4).

## Review

The first review found no defects that had to be blocked. I fixed the following.

- If you un-completed an item with a past date, the whole schedule was pushed back by the number of days since completion, and it could not be undone. It was a problem of the detailed rule the agent set at first, so I fixed rule chapter 4 to move only that item to today.
- Items moved together with the later schedule could exceed the 730 day limit. It now applies to the items moved together too.
- When the move form was opened or a move was rejected, focus was lost. I send it to the date input. If the schedule was deleted in another tab, I send it to the title.
- The by-date message remained on another schedule's screen. I clear it when you start another action, and also when you fix the date.
- Items with the same date had the same name for a screen reader. I add a sequence number.
- The move form could remain on a completed item, and checking another day closed the open form.
- The name edit response could carry the date from before the push.
- I added tests: keeping the target time and chapters, items with the same date, moving before the start date, completing everything, reverting when rejected, and the 730 day boundary.

The automatic pushing in the list lookup applies to all schedules, so it could push the schedules of other test files running in parallel. It is interference between tests that has no effect on the real app. I made the three schedule integration test files take the repository's shared lock in turn.

What I did not fix: `GET /:id` reads the summary and the items separately, so if a move from another tab commits in between, one mismatched response can come out. It is corrected at the next lookup and no data is corrupted.

The second review also found no data defects, and I fixed the following. The review is limited to 2 rounds, so I did no further review.

- The focus and message for when the schedule was deleted in another tab did not actually work. When read again, it disappeared with the by-date card. It was not revealed because the fake server in the test returned the schedule even after a 404. I show the message on the list card and send focus there too.
- If a 409 came up while trying to move a day completed in another tab, focus was lost. I close the form and send focus to that day's checkbox.
- I fixed an error message whose investigation was wrong, and removed a useless query condition.
- The problem that the "늦어짐" ("Delayed") mark remains after cancelling a completion needed a rule to be decided, so I split it into #165.

This second fix concerns focus and messages on failure paths, so I checked it with automated tests, and the browser check is the result up to the commit before it.

## Not confirmed

There was no API key (#129), so I could not create a schedule with the real holiday API. The browser check was done by temporarily putting the 2026 holidays into the test DB, and I deleted them afterward. I cannot change the server date, so I reproduced the automatic pushing by pulling item dates into the past in the test DB.

The local `node_modules` has zod 3.25.76, and `backend/package.json` on main became 4.6.7 through another PR. The user does the package installs, so the local checks ran with the old version, and the new version is checked by CI.

## Verification

`npm run check` with `TEST_DATABASE_URL` set passed. Backend 412, frontend 192, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards. I applied migration 017 to the test DB.

I checked with headless Chrome at PC 1440×900 and mobile 390×844. 32 items passed and I looked at the screenshots myself. I looked at completion and the strikethrough, keeping focus, no move button on a completed day, moving alone, moving together with the later schedule, the number of days delayed, automatic pushing and keeping gaps, and no horizontal scroll.

I deliberately broke the logic in 14 ways to see whether the tests catch it. At first they missed 2 (a future item being pulled earlier, and no lock on a concurrent lookup), so I added a test that checks it is not pulled earlier, and a test that commits after confirming the request is waiting on the lock. Now all are caught.

## Tests

- `backend/test/schedule-adjust.integration.test.ts`: automatic pushing and keeping gaps, pushing on list lookup, future items not pulled earlier, concurrent lookups, completing and cancelling, cancelling a completion of a past item, moving alone and pulling earlier, moving together with the later schedule, wrong dates and boundaries, and an item of another schedule.
- `frontend/src/schedules.test.tsx`: completing and cancelling, focus, moving and cancelling, including the later schedule, the rejection message, and showing the number of days delayed.
