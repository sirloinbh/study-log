# #406 Use 13px labels in the Stats charts

Issue: https://github.com/sirloinbh/study-log/issues/406 (epic #259). Found in the UX audit of 2026-11-24 (lane-4), second round. Follows #396, which fixed the page text but not the chart text.

## Purpose

The study time chart's axis labels were 11px and the review chart's bar labels (which carry the counts) were 12px; the rule is no text under 13px.

## Changes

- `study-time-chart.tsx`: both axes `fontSize={13}`. `review-rate-chart.tsx`: x axis `fontSize={13}`.
- `stats.test.tsx`, `stats-review.test.tsx`: the axis stand-ins expose `fontSize` and the tests assert at least 13.

## Verification

- Browser check (Playwright, Vite dev, realistic mocks): all axis labels compute to 13px at 360, 390 (touch) and 1440px wide; none is clipped at the left or right of its chart, and the screenshot shows no overlapping labels.
- `npm run check`: see the PR.

## Limits

The heatmap's month and weekday labels (10-11px beside 11px cells) are unchanged: a bigger heatmap needs a design choice, noted in the issue.
