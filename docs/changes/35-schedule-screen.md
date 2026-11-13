# #35 Schedule creation screen and list view

- Issue: [#35](https://github.com/sirloinbh/study-log/issues/35)
- Branch: `feat/35-schedule-screen`
- Rules: chapters 1 and 6 of the [study schedule rules](../decisions/schedule-rules.md)

## Purpose

Create a schedule from a period and a daily amount, and check the target time for each date.

## Changes

- `frontend/src/schedules.tsx`: the schedule creation form, the list of my schedules, and the list by date.
- `frontend/src/schedule.ts`: API response types, converting time to minutes, and date display.
- `frontend/src/app.tsx`: the `/schedules` route and the menu item "일정" ("Schedule").
- `frontend/src/style.css`: the list by date and the shared spacing of the schedule screen.

## Implementation judgment

- The form is pre-filled with 2 hours for weekdays and 5 hours for weekends and holidays (rule chapter 1). The start date is filled with today, and the end date with day 30.
- Time is entered in steps of 0.5 and sent to the server in minutes.
- I added delete. It is not in the issue's scope, but in rule chapter 6 the only way to change the period or the amount is to delete and create anew.
- I did not add a name edit screen. It is not in the issue's scope, and only the API (`PUT /api/schedules/:id`) exists.
- I did not add a calendar view. The issue asks for a list view, and mentions the calendar only as a review for sharing. The study log calendar (`calendar.tsx`) is tied to record lookup, so sharing needs separate work.
- The list by date does not mark whether a day is a holiday. This is because the item does not store the kind of day (#34). It is told apart only by the amount.

## Not confirmed

There was no API key (#129), so I could not create a schedule with the real holiday API. The browser check was done by temporarily putting the 2026 holiday (December 25) into the test DB, and I deleted it afterward. While there is no key, a schedule cannot be created in the real app and the screen shows the reason.

## Review

In the first review there were no defects that had to be blocked, and I fixed the following.

- The delete failure message appeared only on the form card, so it was not visible on a mobile screen scrolled to the list. I moved the message to the list card.
- After one failed lookup by date, pressing the same schedule did not read again. Now pressing a schedule reads again.
- If the list could not be read again after a delete, the deleted schedule still looked there. Now it is removed right away when the delete succeeds.
- A long name with no spaces could overflow the title horizontally.
- The old error text remained even after fixing the input, and after creating a schedule the delete confirmation of another schedule remained.
- When a schedule crosses a year, the same month and day could not be told apart in the list by date. I add the year to dates in a year different from the start date.
- I added tests for the focus of the delete flow, 404, and concurrent submits.

The second review also found no defects that had to be blocked, and I fixed 3. The review is limited to 2 rounds, so I did no further review.

- If the re-lookup after create or delete failed, the already read list by date turned into an error and focus was lost. The list by date does not change, so I keep what was read.
- The delete message was below the list, so with a long list it appeared off screen. I moved it right under the card title.
- When a retry failed again, the screen stayed the same. I now clear the error while trying, so if it fails again it is shown anew and read.

I did not fix which schedule is opened first (right now the schedule with the latest start date). It will be decided in #37 and #38, which use the schedule screen more.

## Verification

`npm run check` with `TEST_DATABASE_URL` set passed. Backend 377, frontend 171, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards.

I checked with headless Chrome at PC 1440×900 and mobile 390×844. 38 items passed and I looked at the screenshots myself. I looked at 5 hours on a Friday that is a holiday, 2 hours on an ordinary Friday, 5 hours on Saturday, the today mark, the rejection message and kept input when there is no key, the delete confirmation and focus, and no horizontal scroll even with a 200-character name with no spaces. This is the result of checking again with the final code after the review fixes.

## Tests

- `frontend/src/schedules.test.tsx`: time conversion and boundaries, the default end date, date display, the defaults of the form, the create request and display by date, an amount out of range, the message and kept input when the server rejects, selecting a schedule, the today mark, delete confirmation and cancel, delete failure, load failure, and ignoring a late response.
- `frontend/src/app.test.tsx`: added the schedule to the menu and the address.
