# #180 Narrow the study time statistics to a textbook

- Issue: [#180](https://github.com/sirloinbh/study-log/issues/180)
- Branch: `feat/180-study-time-textbook`

## Purpose

The textbook filter existed only on the "Textbooks and schedules" card. The study time metrics and charts were filtered only by period and study type. On 2026-11-03, the user decided to narrow study time by textbook too (the remaining work of #8).

## Changes

- `backend/src/stats.ts`: added `textbookId` to `/api/stats/study-time`.
  - When given, the cumulative and period totals, today, the average, and the day, week, and month groupings are all counted only from that textbook's study records. The start date of the "all" period is also that textbook's first record.
  - It can be used together with the study type.
  - A missing textbook returns 404 "교재를 찾을 수 없습니다" ("Textbook not found"). A textbook with no records answers 0. A wrong ID format gives 400 "교재 ID가 올바르지 않습니다" ("The textbook ID is not valid"). The format check is shared with `/api/stats/textbooks`.
  - Added `textbookId` (`null` if none) to the response.
- `frontend/src/study-stats.ts`: `studyTimePath` takes a textbook ID.
- `frontend/src/stats.tsx`:
  - Put a "교재" ("Textbook") select box under the study type buttons. When you pick a textbook, the metric cards and the study time chart change to that textbook, and the textbook name is added to the "총 학습 시간" ("Total study time") card.
  - The accessible name is "학습 시간 교재" ("Study time textbook"). This is to tell it apart from the "교재" select box of the "교재와 일정" ("Textbooks and schedules") card below.
  - If the textbook list cannot be loaded, only "전체" ("All") remains, and it announces "교재 목록을 불러오지 못해 교재로 좁혀 볼 수 없습니다" ("Could not load the textbook list, so you cannot narrow by textbook").
  - The review completion rate and the heatmap are not filtered, as before.
- `docs/next-steps/README.md`: removed the finished #179 and #180 from the candidates.

## Tests

- `study time can be narrowed to one textbook` in `backend/test/stats.integration.test.ts`: with dates in 2095 and three textbooks only this test uses, it checks the following.
  - The per-textbook total, today, cumulative, and number of days studied are right. It is filtered together with the study type.
  - The "all" period starts at that textbook's first record. A textbook with no records is 0 and counts only today.
  - If there is no textbook, all records are counted and `textbookId` is `null`.
  - A missing textbook is 404, and `0`, `abc`, `1.5`, and an empty value are 400.
- `backend/test/stats.test.ts`: fixed the expected value so `null` is passed to the query when no textbook is given.
- `frontend/src/stats-textbook-filter.test.tsx` (a new file), five tests:
  - Picking a textbook puts the textbook in the request and shows that textbook's time and name. It changes together with the study type and period, and goes back with "전체".
  - A textbook with no records is 0 minutes.
  - The select box name does not collide with that of the "교재와 일정" card.
  - If the textbook list cannot be read, it announces the reason and only "전체" remains.
  - A textbook deleted elsewhere shows an error, and it goes away when you go back to "전체".

## Verification

- With headless Chrome (the DevTools protocol), I checked 20 items at PC 1440×900 and mobile 390×844. I put two textbooks and three records for today into the test DB (90 minutes and 45 minutes per textbook, and 20 minutes with no textbook) and started it with `npm run dev`.
  - I confirmed it changes to 2 hours 35 minutes for all, 1 hour 30 minutes for linear algebra, and 45 minutes for calculus, and goes back to "전체".
  - I confirmed the chart is drawn and the summary sentence is also based on the textbook (1 hour 30 minutes).
  - There is no horizontal scroll, and the select box is within the content width with a height of 36px.
  - In the first run, the item "the chart stays visible" failed because a selector in the check script was wrong. I saw in a screenshot that the chart card was there, fixed it to wait until the bars are drawn, and ran again.
  - After checking, I deleted the rows I had put in. `textbooks`, `study_logs`, and `schedules` are all 0 rows.
- `npm run check` with `TEST_DATABASE_URL` set: passed (exit 0).
  - Backend 425 passed (0 skipped).
  - Frontend 214 passed, 2 skipped (the dark-only app tests from the central standards).
  - Skills 4 passed.
- `npm run standards:check` passed.

## Review

The first review found no defects in the code or the tests. I checked the SQL arguments, the heatmap call site, the "all" start date and the cumulative figure by textbook, the cache per request path, and how the existing mock server handles it. I only fixed that `docs/next-steps/README.md` wrote that the not yet merged #180 was "merged".

In the second review I confirmed that the first-round comment was fixed and that the new sentence matches the facts, and no defects remained. I also wrote the `npm run check` and `standards:check` results that were missing from this record's verification section.
