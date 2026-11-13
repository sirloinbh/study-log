# #20 Study pattern analysis (productive hours and weekdays)

- Issue: [#20](https://github.com/sirloinbh/study-log/issues/20) (parent #9)
- Branch: `feat/20-study-patterns`
- Prerequisites: #10 study log DB and API, #19 retrospective screen (merged)

## Purpose

Show with data when studying goes well. When you write a retrospective, you also see the pattern of that period.

## Decisions

I set the undecided rules by the criteria below. I also left them in an [issue comment](https://github.com/sirloinbh/study-log/issues/20#issuecomment-6359438004).

- **What is counted:** records in progress, completed, and abandoned, without "planned" records (same as the statistics)
- **By hour:** split each record's study time by minute across the times you actually studied, and add it to hours 0 to 23. Example: 20:30 to 22:00 -> 30 minutes in hour 20 and 60 minutes in hour 21. For a record that crosses midnight, the minutes after midnight are added from hour 0.
- **By weekday:** the weekday of the record's study date (start date). Counted from Sunday (#96).
- **Most productive hour and weekday:** the 1-hour slot and the weekday with the most study time. If tied, pick the earlier one, and if there are no records, show nothing.
- **Location:** the pattern of the week or month you are viewing on the retrospective screen

## Changes

- `backend/src/stats.ts`
  - `studyPattern(sessions)`: calculates the totals by hour and weekday and the hour and weekday with the most time with the rules above (exported for unit tests).
  - `GET /api/stats/patterns?from=&to=`: by default it runs from the last 3 months (the same start date as "the last 3 months" in #47) to today. The response is `{ from, to, totalMinutes, byHour[24], byWeekday[7], topHour, topWeekday }`.
  - A start date > end date or a wrong date gives 400. A period over 10 years also gives 400 "기간은 10년 이내로 지정하세요" ("Set the period within 10 years") (the same limit as the #47 series).
- `frontend/src/StudyPattern.tsx` (a new file), `frontend/src/study-stats.ts`, `frontend/src/Retrospectives.tsx`, `frontend/src/style.css`
  - "학습 패턴" ("Study pattern") under the retrospective writing card
    - Summary sentence: "가장 많이 공부한 시간대는 9시~10시(6시간 50분), 요일은 수요일(3시간 30분)입니다." ("The hour you studied the most is 9 to 10 (6 hours 50 minutes), and the weekday is Wednesday (3 hours 30 minutes).")
    - 7 weekday bars (Sun to Sat, width relative to the weekday with the most)
    - 24 hour bars (the hour with the most is a dark color, and each bar's tooltip has the value)
  - It is drawn with CSS widths and heights without a chart library (unrelated to the chart library decision #49).
  - When you move the period, it loads the pattern for that period, and it loads again after saving or deleting a retrospective. Responses are kept per period.
  - If there are no records it shows "이 기간에는 학습 기록이 없어 패턴을 볼 수 없습니다" ("There are no study records in this period, so no pattern can be seen"), and if it fails it shows an error.

## Tests

- `backend/test/stats.test.ts`
  - Hour allocation (20:30 to 22:00, 23:30+90 minutes crossing midnight, within one hour), weekday (a midnight crossing is also the start date), the total is preserved, and the earlier hour on a tie
  - No records, date validation 400, and the default period (the last 3 months)
- `backend/test/patterns.integration.test.ts` (a real DB, a new file, year 2103): a Sunday record, a Wednesday record that crosses midnight, adding up the same hour, excluding planned records, excluding out of range, the hour and weekday with the most, and an empty period
- `backend/test/retrospectives-ui.test.ts`
  - The summary sentence, the weekday bar widths, 24 hour bars with the highlight and tooltips, and requesting again when the period moves
  - Showing no records and failure, and the hour name and bar width functions

## Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 231, pass 214, fail 0, skipped 17 (DB) |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 010 applied | exit 0. tests 231, pass 231, fail 0, skipped 0               |

- Browser: I checked by starting the Vite dev server and this branch's API (a local Docker test DB) with Playwright (Chromium).
  - API: the October 2026 pattern total of 985 minutes is the same as this month's total (985 minutes) in the statistics API.
  - Mobile 390×844, monthly retrospective
    - "가장 많이 공부한 시간대는 9시~10시(6시간 50분), 요일은 수요일(3시간 30분)입니다."
    - 7 weekday bars, the hour bars
    - No overflow of the area and no horizontal scroll
  - PC 1440×900: the same content, no horizontal scroll
  - Screenshots: [mobile 390×844 (study pattern)](assets/20-mobile-390x844.png), [PC 1440×900](assets/20-pc-1440x900.png)

## Limits and follow-up

- The value of each hour bar is seen only in a mouse tooltip. For screen readers, the summary sentence and the values of the weekday bars are read.
- I did not put the pattern on the statistics screen separately. If needed, it can be attached with the same API.

## Review

- First automated review (read-only, a separate agent): nothing to fix
  - Checked: time allocation and midnight crossing, weekday in UTC, period validation, the cache per period and discarding late responses, accessibility
  - Note (below the reporting bar): the pattern API also counts future dates inside the period. It is the same criterion as the period summary of the retrospective screen (#19), and non-"planned" future records are rare, so I left it.
  - There was nothing to fix, so I did not do a second review.
