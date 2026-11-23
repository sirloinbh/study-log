# 347: Move the stats screen layout to Tailwind

## What changed

- `stats.tsx`, `textbook-stats.tsx`, `review-rate-chart.tsx` (value line), `study-time-chart.tsx`, `retrospectives.tsx` and the cards skeleton in `loading.tsx` use Tailwind classes for the period buttons, the metric cards grid, the textbook filter and the chapter progress bars.
- Removed from `style.css` (806 to 731 lines): `.period-filter`, `.metric-grid`, `.metric h2`, `.metric-value`, `.metric .status`, `.metric .nowrap`, `.textbook-filter` (and its select rule), `.textbook-stats .status`, `.textbook-progress` (and its parts).
- Metric cards carry `data-metric` and `data-metric-value` for the tests. `.retro-summary`, `.calendar-head` and `.stats` stay: other screens (retrospectives, schedule detail) share them.
- The filter selects get `w-full min-w-0` directly; the other select looks already come from the shared `NativeSelect`.

## Tests

- `stats.test.tsx` reads the metric cards by `data-metric` and finds the metrics region by role.

## Browser check (Vite, mock API, Chromium)

- 1440x900: compared with `main` in the same dev server. Stats page: all 603 elements identical (position, size, colours, font, margins, padding, radius, gap). Retrospectives page (period buttons): all 129 elements identical.
- 390x844: no page overflow; four metric cards in two columns; the filter select is 320 px wide at most; progress bars are 8 px high with the primary fill.

## Checked

`npm run check`, `node .standards/check.mjs`: see the PR.
