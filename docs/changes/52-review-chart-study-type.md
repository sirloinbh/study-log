# #52 Review completion rate chart and the study type filter

- Issue: [#52](https://github.com/sirloinbh/study-log/issues/52)
- Branch: `feat/52-review-chart-study-type`
- Rules: chapter 6 of the [review interval rules](../decisions/review-rules.md)

## Purpose

On the statistics screen, see how well the reviews were kept, and view study time split into new study and review.

## User decision (2026-11-01)

The study type is picked yourself when you write a study record. The default is new, and all existing records start as new. The filter applies to the study time metrics and charts on the statistics screen.

## Changes

- `database/migrations/013_study_log_type.sql`: `study_logs.study_type` (`new`, `review`, default `new`).
- `backend/src/study-logs.ts`: added `studyType` to save, edit, and lookup.
- `backend/src/stats.ts`: added `type=all|new|review` to `GET /api/stats/study-time`. The default is `all`, and even the total study time is calculated for the chosen type.
- `frontend/src/StudyLogs.tsx`: added the type to the input form. In the list, search results, and calendar, the `복습` ("Review") mark is attached only to records of type review.
- `frontend/src/Stats.tsx`: added the study type filter under the period.
- `frontend/src/ReviewRateChart.tsx`: shows the completion rate and the due, completed, and late bars. The code that loads the chart library moved to `frontend/src/use-recharts.ts` and is shared with the study time chart.

## Implementation judgment

- The heatmap is a "last 1 year" chart that does not take the period filter either, so the type filter does not apply to it. The review completion rate is independent of the type too.
- Late overlaps due, and a late completion overlaps completed too. So I draw three separate bars instead of stacked bars.
- Instead of a number above the bar, I put the count in the axis name (`완료 0회`, "Completed 0 times"). Recharts does not draw the number of a bar with height 0, so 0 times could not be read.
- I turned off the animation. It played every time the parent screen redrew, so the review chart moved when you pressed the filter.
- The review chart loads the chart library only when there is data to draw. At first it loaded even when the response failed, so `app.test.tsx`, which only receives failure responses, failed in the full check with a timeout. The study time chart loads even with no records if the response succeeds, and I did not change that this time.

## Verification

`npm run check` with `TEST_DATABASE_URL` set passed. Backend 338, frontend 123, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards.

I applied migration 013 to the test DB and checked 35 items with headless Chrome at PC 1440×900 and mobile 390×844. They include the completion rate and bars, the 3 axis names, the chart width, no horizontal scroll, the type filter, changing the period, the type in the input form, and the review mark in the list. I deleted the records after checking.

In a full page screenshot the chart was once captured narrow, but the width measured within the screen size was the same as the card (PC 910px, mobile 308px). It was a phenomenon caused by the capture.

## Review

The first review found no runtime defects and I applied 4 low-level comments.

- I wrote in rule chapter 6 that the start date of the all-time period differs per type.
- I narrowed the description of the condition for loading the chart library to the review chart.
- I added tests for the type filter in another period, the heatmap after the filter, a type with no records, the review mark in search and the calendar, and the new constraint.
- I set the reference values per type so the tests pass even if review records remain in the shared test DB.

The second review found no defects. I only added the two files missing from the test list of the change record.

## Tests

- `backend/test/study-log-type.test.ts`: 400 for a wrong type, the default new, save, lookup, and edit.
- `backend/test/stats.integration.test.ts`: metrics and daily totals per type, other periods, the heatmap after the filter, the default, and 400.
- `backend/test/stats.test.ts`: the all-time period of a type with no records, the type passed to the query.
- `backend/test/migrations.integration.test.ts`: the new constraint.
- `frontend/src/stats-review.test.tsx`: the completion rate and counts, changing the period, due 0, the failure display, the filter not calling the review statistics again, and the bar values.
- `frontend/src/study-logs-type.test.tsx`: the form default and save, keeping the type on edit, and the list display.
- `backend/test/stats-ui.test.ts`, `backend/test/study-logs-ui.test.ts`, `backend/test/study-logs.integration.test.ts`, `frontend/src/study-logs-change.test.tsx`: reflected the new field and request.
