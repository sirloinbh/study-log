# 347: Move the chart layout to Tailwind

## What changed

- `study-time-chart.tsx` and `review-rate-chart.tsx` style their card, header and chart box with Tailwind classes. The `.study-chart`, `.chart-head` and `.chart-box` rules are removed from `style.css` (829 to 806 lines). Bars still take the primary colour through `currentColor`, and axis labels the muted colour (`[&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground`).
- The `.period-filter` rule stays for now: the stats screen and retrospectives use it too and move in the next PR.

## Tests

- `stats-review.test.tsx` finds the review card by its labelled heading instead of the `.review-chart` class.

## Browser check (Vite, mock API, Chromium, Stats page)

- 1440x900: compared with `main` in the same dev server. All 146 elements of both chart cards have the same position, size, colours, fills, margins and gaps.
- 390x844: no page overflow; both charts draw, bar fill is the primary colour, axis labels are muted.

## Checked

`npm run check`, `node .standards/check.mjs`: see the PR.
