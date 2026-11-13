# #47 Study time aggregation API (day, week, month, cumulative, average)

- Issue: [#47](https://github.com/sirloinbh/study-log/issues/47) (parent #8)
- Branch: `feat/47-study-time-stats`
- Prerequisite: #10 study log DB and API (merged)

## Purpose

Aggregate study records by period so the statistics dashboard (#48) and the heatmap (#50) can use them.

## Decisions

The issue left "the denominator of the average to be fixed when starting" and other rules, and I set them by the criteria below. I also left them in an [issue comment](https://github.com/sirloinbh/study-log/issues/47#issuecomment-6357561021).

- **What is counted:** records with the status "planned" are not studied yet, so I leave them out. I add up the study time of records in progress, completed, and abandoned. Dates after today are left out too.
- **Periods (`Asia/Seoul`, today = `serviceDate()`)**
  - This week: Monday to today
  - This month: the 1st to today
  - The last 3 months: the day after the same day 3 months ago to today. If that day does not exist in that month, it counts as the last day of that month (for example, May 31 -> from March 1).
  - All: the first record date to today. But the daily, weekly, and monthly series and the period total go only up to the last 3653 days (about 10 years). The overall cumulative total (`cumulativeMinutes`) counts all records.
- **Average:** by default, it is the daily average divided by the number of calendar days in the period (including days not studied). It also gives the average divided by only the days studied. Both are rounded to the minute.

## Changes

- `backend/src/stats.ts` (a new file), `backend/src/app.ts`
  - `GET /api/stats/study-time?period=week|month|3months|all` (default `week`)
  - Response
    - `period`, `from`, `to`
    - `totalMinutes` (the period total), `todayMinutes`, `cumulativeMinutes` (the overall cumulative total regardless of the period)
    - `days`, `studyDays`, `averageMinutesPerDay`, `averageMinutesPerStudyDay`
    - `daily` (including empty days as 0), `weekly` (`weekStart` on a Monday basis), `monthly` (`YYYY-MM`)
  - The daily totals are found in the DB by making all dates of the period with `generate_series` and joining the study records. Weekly and monthly group those daily values. The first and last week and month include only the part that falls in the period.
  - A record that crosses midnight belongs to its start date, as in the existing rule.
  - A wrong period gives 400 "기간은 이번 주, 이번 달, 최근 3개월, 전체 중에서 고르세요" ("Pick the period from this week, this month, the last 3 months, and all").
  - I export the period calculation functions (`periodStart`, `weekStart`, `addDays`, `bucket`) for unit tests.
- There is no DB change. The daily totals can use the existing date index, but the overall cumulative total and the first record date scan all records up to today (enough for a personal service scale).

## Tests

- `backend/test/stats.test.ts` (no DB)
  - The week start on Monday, a week that crosses the year end
  - The period start: this week, this month, the last 3 months (including a missing day, a leap year, and the start of a year), and all (the first record / no records / a future record)
  - Date addition (the month end, a leap year), and grouping by week and month
  - A wrong period 400
  - 0 and an average that does not divide by zero when there are no records
- `backend/test/stats.integration.test.ts` (a real DB)
  - With "today" set to 2096-05-16 (Wed), insert 8 records with different statuses and dates. The year 2096 is before the dates other test files use (2097 and later), so it does not mix.
  - This week (Mon 5/14 to Wed 5/16) 150 minutes: Sunday 5/13 is last week
  - This month 215 minutes, 4 of 16 days studied, average 13 minutes / 54 minutes, and the weekly grouping
  - The last 3 months (2/17 to 5/16, 90 days) 335 minutes, and the monthly grouping
  - Excluding planned and future records, and a record that crosses midnight goes to its start date
  - The cumulative total is the value before the test + 365 minutes. Records already in the shared test DB are subtracted as the baseline.
  - Leaving out the period gives this week, and an empty period is 400

## Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 183, pass 170, fail 0, skipped 13 (DB) |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 009 applied | exit 0. tests 183, pass 183, fail 0, skipped 0               |

- There was no screen change, so I did not check in a browser. The screen is #48.

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no comments, so I do not do a second review. There is no issue to split off either.

- Confirmed points
  - The date calculation (UTC strings, Monday, the 3-months-ago boundary, a leap year, the start of a year) is right.
  - The SQL is right (`generate_series` and the date conversion, the integer conversion of the sum, the parameter order).
  - Even when there are no records or the first record is in the future, it does not divide by zero.
  - I recalculated the integration test expected values by hand and confirmed they are right. They do not overlap in date with other test files.
- Note (applied): the overall cumulative query cannot use the date index and scans everything. I corrected the explanation that said "it uses the existing date index".

## Automated security review

The automated security review after the commit raised a medium comment. I fixed it in this PR before merging.

- Comment: a study date also accepts a very early date such as `0001-01-01`. If one such record exists, every "all" request would build and answer a daily series of hundreds of thousands of days (amplifying resource use through stored input).
- Applied: I limited the start of the "all" period to the last `maxSeriesDays` = 3653 days (about 10 years). The overall cumulative total still counts all records.
- Tests
  - Unit test: if the first record is in year 0001, the start is cut to 10 years ago (2016-10-23), and if it is within range, it stays as it is
  - Integration test: if you put in a 0001-01-01 record, it goes into the cumulative total, and the series is 3653 days from 2086-05-17

## Automated code review, round 2

A separate read-only review agent checked the security fix commit and the whole final PR again. The review is limited to 2 rounds, so I do not do a third.

- The series limit calculation is right. On the basis of 2096-05-16, 3652 days before is 2086-05-17, and including both ends it is 3653 days (including three leap days).
- The other periods are short by structure (at most 7, 31, and about 92 days), and the server calculates the start and end dates, so there is no path that grows without end.
- The 0001-01-01 test record is deleted by the before and after cleanup. It does not mix into other tests.
- There were no comments and no issue to split off.

## Limits and follow-up

- The aggregation is calculated on every request. It is enough for the number of records of a personal service. I will consider a cache or a materialized view when it gets slow.
- Filters by textbook and by study type are not in this issue's scope (#51 and others).
- The series of the "all" period goes only up to about the last 10 years (3653 days). Older records go only into the overall cumulative total.
