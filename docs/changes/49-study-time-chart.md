# #49 Choosing a chart library and the study time chart

- Issue: [#49](https://github.com/sirloinbh/study-log/issues/49) (parent #8)
- Branch: `feat/49-study-time-chart`
- Prerequisite: #48 statistics dashboard main and key metric cards (merged)

## Purpose

See the trend of study time by day, week, and month as a chart on the statistics screen.

## Decisions

- The user chose **Recharts** as the library ([decision comment](https://github.com/sirloinbh/study-log/issues/49#issuecomment-6360593234)).
- Candidates compared
  - Hand-drawn SVG: no install. It can be drawn with CSS like the #20 study pattern.
  - Chart.js: canvas based, and needs a React wrapper.
  - Recharts: axes, tooltips, and responsiveness are built in as React components.
- Bundle
  - If you import Recharts as it is, the main JS grew from 129.58 kB gzip to 239.24 kB (+110 kB).
  - So I load it dynamically in the chart component. The main JS is 130.65 kB (+1 kB), and Recharts is a separate file (158.27 kB gzip) fetched when you open the statistics screen.
- Chart rules
  - One bar is one day, one week (from Sunday, #96), or one month.
  - Default unit: day for this week and this month, week for the last 3 months, and month for all. It remembers the unit chosen for each period.
  - The bar height is the time (to one decimal place), and the tooltip is the exact hours and minutes.
  - The data uses `daily`, `weekly`, and `monthly` of the existing `GET /api/stats/study-time`. I did not change the API.
  - If there are no study records, it shows "이 기간에는 학습 기록이 없습니다" ("There are no study records in this period") instead of the chart.
  - The chart is hidden from screen readers (`aria-hidden`). Instead it announces with a sentence like "the day you studied the most among N days is …".

## Checks before installing (the global supply chain rule)

- `recharts@3.10.1`
  - Published 2026-07-25, the publisher is GitHub Actions (with SLSA provenance)
  - The repository is `github.com/recharts/recharts`, with 3 maintainers
  - `prepare` (husky) is not run on a registry install.
  - I pinned the version exactly and installed with `--ignore-scripts`.
- There are 39 new packages. Most are the d3 family (mbostock), the Redux Toolkit family, es-toolkit, victory-vendor, and so on.
  - No install script, all from `registry.npmjs.org`
  - No existing package changed or removed
- Some versions were less than 14 days old, so I pinned them with `overrides`. The root `package.json` applies to the workspace, and `frontend/package.json` applies to a standalone install of the sub-repository.
  - `immer`: the range `^11.1.8` picked the latest 11.2.9, which was published on 2026-10-22. In three days, 11.1.22 to 11.2.9 had come out one after another. I pinned it to 11.1.21 (2026-10-02).
  - `react-is` (a peer of Recharts): the latest 19.3.1 was published on 2026-10-14. I pinned it to 19.3.0 (2026-09-09), the same as the installed React.
- After pinning, the most recent publication is `@reduxjs/toolkit@2.13.0` (2026-09-29).
- Code check: in the 38 new folders, I looked for leaked addresses, token variables, abnormal files, and install hooks, and found none.
  - The only place where `child_process` appeared is `es-toolkit/dist/server/exec`. It is a documented server-side `exec` function, and Recharts does not use it.
- `frontend/package-lock.json`
  - I rebuilt it in a temporary folder with `--package-lock-only --ignore-scripts`.
  - The 39 added entries have the same versions and integrity as the root.
  - The only removed line is the last comma of the dependency list.

## Changes

- `frontend/src/study-stats.ts`
  - `chartUnits`, `chartUnitLabels`, `defaultChartUnit`
  - `chartBars(stats, unit)`: the list of bars. The labels are "10/21" for day, "10/18~" for week, and "26.10" for month.
  - `busiestBar`: the bar with the most. If tied, the earlier one, and none if there are no records.
- `frontend/src/StudyTimeChart.tsx` (a new file)
  - The "학습 시간 추이" ("Study time trend") card holds the day/week/month buttons (`aria-pressed`), the summary sentence, and the bar chart.
  - Recharts is fetched with `import('recharts')` on first use, and kept in the module after that.
  - While fetching it shows "그래프를 불러오는 중…" ("Loading the chart…"), and if it fails, "그래프를 불러오지 못했습니다" ("Could not load the chart"). The summary sentence stays.
- `frontend/src/Stats.tsx`: put the chart between the metric cards and the heatmap. The dashboard keeps the unit chosen per period. This is so the unit is not lost if the chart disappears while another period is loading.
- `frontend/src/style.css`: the chart card header, the bar color (`currentColor` = `--primary`), and the axis text color
- `backend/test/ui-harness.ts`: added a stand-in for `recharts`.
  - It leaves each part as an element like `recharts:Bar` and keeps the props.
  - It has no `then`, so even when fetched with a dynamic import it is not mistaken for a promise.

## Tests

- `backend/test/stats-ui.test.ts`
  - The bar data (hours) in day units and the summary sentence, the `dataKey` of the bar, and the hours and minutes in the tooltip
  - Switching day -> week -> month, and one bar (a single data point) is also shown as a chart and a sentence
  - The default unit of another period, and keeping the chosen unit when you come back
  - Empty data and data that is all 0 minutes: a notice with no chart
  - If the chart file cannot be fetched, the error is shown and the summary sentence stays
  - `chartBars` month labels and time rounding, and `busiestBar` ties and none
  - I narrowed the existing period button test to look only at the buttons inside the period group. This is because the chart unit buttons also use `aria-pressed`.

## Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 254, pass 236, fail 0, skipped 18 (DB) |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 010 applied | exit 0. tests 254, pass 254, fail 0, skipped 0               |
| `vite build` size             | Local                                                            | Main gzip 130.65 kB, Recharts separate 158.27 kB             |

- Browser: I checked by starting the Vite dev server and the local API (the existing records in the Docker test DB) with Playwright (Chromium).
  - Mobile 390×844, this week
    - 4 bars were visible, and a day with no records had height 0.
    - The summary was "6개 날 중 가장 많이 공부한 날은 10/23(2시간 45분)입니다." ("Among 6 days, the day you studied the most is 10/23 (2 hours 45 minutes).").
    - The bar color was `rgb(41, 68, 50)` (`--primary`), and there was no horizontal scroll.
  - PC 1440×900, the last 3 months
    - The default unit was "week" and there were 14 bars.
    - The summary was "14개 주 중 가장 많이 공부한 주는 10/18~(7시간 30분)입니다." ("Among 14 weeks, the week you studied the most is 10/18~ (7 hours 30 minutes).").
    - When I hovered over a bar, the tooltip showed "10/11~ 학습 시간 : 3시간 25분" ("10/11~ study time: 3 hours 25 minutes").
  - Screenshots: [mobile 390×844 (this week, day)](assets/49-mobile-390x844.png), [PC 1440×900 (the last 3 months, week, tooltip)](assets/49-pc-1440x900.png)

## Limits and follow-up

- I did not add a line chart. One bar chart shows day, week, and month. If a trend line is needed, a `Line` can be added with the same data.
- If you view "all" in day units, there are very many bars (up to 3653) and they get thin. The default unit is month.
- The review completion rate chart (#52) is attached in the same way after the review feature (#41 to #46).

## Review

- First automated review (read-only, a separate agent): nothing to fix
  - Checked
    - The labels, time rounding, the tie rule, and the particles of the summary sentence
    - Lazy loading (cache, a late response, failure)
    - Recharts v3 props (the tooltip format function and so on)
    - Accessibility
    - The compatibility of `overrides` with the Redux Toolkit and react-redux ranges
  - Note (below the reporting bar)
    - If you pick "all" in day units, there are many bars and the animation may be slow. I did not measure it, and the default unit is month.
    - For a record of about 2 minutes or less, the bar height becomes 0 because of time rounding. It still shows in the summary and the tooltip.
  - There was nothing to fix, so I did not do a second review.
