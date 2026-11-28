# #481 Show chapters and sections finished instead of study time on the dashboard, Week and 12 weeks views

- Issue: [#481](https://github.com/sirloinbh/study-log/issues/481) (parent #469)
- Branch: `feat/481-finished-counts-screens`
- Needs: #480 (merged)

## Purpose

Study amount is judged by chapters and sections finished. No dashboard chart, card or Week row is labelled in hours; the daily goal card (`StudyGoal`, lane-4's component) keeps the minutes of the day.

## Changes

- Backend (`stats.ts`, `openapi.ts`): new `GET /api/stats/finished-days?from=&to=` (entries finished per day for all textbooks, default the heatmap's 53 weeks, at most 10 years; an entry is on the date of its first done log, as in `finished-contents`); `GET /api/stats/textbooks` rows also carry `completedSections` and `totalSections`. `study-time` and `heatmap` are unchanged but no screen reads them now.
- Dashboard (`stats.tsx`): four cards from `finished-contents`: finished so far (with the totals of the textbook or all textbooks), today, the picked period, and the daily average (entries a day). The study type filter is gone because finished entries have no study type; the textbook filter stays (its accessible name is now "Finished counts textbook"). The chart is `finished-chart.tsx`: stacked chapters and sections by day, week or month, with the sentence naming the busiest bar. `study-time-chart.tsx` is removed.
- Heatmap (`heatmap.tsx`): shaded by entries finished that day (none, 1, 2, 3 to 4, 5 or more) from `finished-days`.
- Week view (`week-view.tsx`): each day shows its chapters and sections and the total; the sessions list no longer shows durations.
- 12 weeks (`twelve-week-view.tsx`): each row shows chapters, sections and the days with a finish; the bar is the entries finished.
- Textbook progress (`textbook-stats.tsx`): sections finished of the total; a book with chapters only shows its chapters; the progress bar is named "<title> sections finished".
- `study-stats.ts` (shared, edited minimally): `heatWeeks` and `monthLabel` accept any day type with a `date`, and the textbook stats type has the section counts.
- Tests: `stats.test.tsx`, `stats-review.test.tsx`, `stats-textbook-filter.test.tsx`, `week-view.test.tsx`, `textbook-stats.test.tsx`, `app.test.tsx` use the new endpoints and labels (and assert no hours outside the goal card); the integration test of #480 covers `finished-days` and the section counts of `/api/stats/textbooks`.

## Not changed

The Dashboard page subtitle ("See study time by period and the daily average at a glance") is in `app.tsx`, which lane-2 owns.
