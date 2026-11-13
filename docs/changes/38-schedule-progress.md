# #38 Show and read schedule progress

- Issue: [#38](https://github.com/sirloinbh/study-log/issues/38)
- Branch: `feat/38-schedule-progress`
- Rules: chapter 5 of the [study schedule rules](../decisions/schedule-rules.md)

## Purpose

Show how far you have progressed against the plan.

## Changes

- `backend/src/schedules.ts`: added `completedCount`, `completedMinutes`, and `progressPercent` to the schedule summary.
- `frontend/src/schedules.tsx`, `frontend/src/style.css`: a progress bar and figures in the schedule by date, and progress in the list.
- `docs/decisions/schedule-rules.md`: added chapter 5 on progress, and moved creation input and editing to chapter 6.

## Implementation judgment

The issue said to decide the criterion when starting. I chose the target time of completed items ÷ the total target time.

- A schedule and study records are not linked, so the time actually studied cannot be the criterion.
- I use time rather than the number of items because the schedule is built in proportion to time. The number of items is shown together.
- The percentage is rounded down, so it is 100% only when everything is done.

## Review

The first review found no defects that had to be blocked. I fixed a wrong test comment, a weak assertion, and a chapter number left in an older document, and added a test that the list follows after completion. That a screen reader does not read the progress change right away is outside the issue's scope, and the completion message is read and the value can be read from the bar at any time, so I left it.

## Not confirmed

There was no API key (#129), so I could not create a schedule with the real holiday API. The browser check was done by temporarily putting the 2026 holidays into the test DB, and I deleted them afterward.

## Verification

`npm run check` with `TEST_DATABASE_URL` set passed. Backend 414, frontend 194, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards. There is no schema change.

I checked with headless Chrome at PC 1440×900 and mobile 390×844. 40 items passed and I looked at the screenshots myself. I looked at the initial 0%, 13% (rounded down) after completing 2 of 15 hours, the bar width, and the progress in the list.

## Tests

- `backend/test/schedule-adjust.integration.test.ts`: calculation by target time, unchanged when moved, goes down when completion is cancelled, 100% only when everything is done, rounding down, the list and the detail match.
- `frontend/src/schedules.test.tsx`: the bar and figures, progress in the list, goes up when completed.
