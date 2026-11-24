# #404 Stop Stats charts from holding focus inside hidden regions

Issue: https://github.com/sirloinbh/study-log/issues/404 (epic #259). Found in the UX audit of 2026-11-24 (lane-4), second round (Reviews, Stats, Retrospectives).

## Purpose

The two Stats charts are wrapped in `aria-hidden="true"` (the sentence above each chart gives the figures), but Recharts 3 adds a focusable keyboard layer by default, so axe reported `aria-hidden-focus` (serious, 2 nodes) and a keyboard user could tab onto something screen readers skip.

## Changes

- `study-time-chart.tsx`, `review-rate-chart.tsx`: `accessibilityLayer={false}` on both `BarChart`s.
- `stats.test.tsx`, `stats-review.test.tsx`: the chart stand-ins expose the prop and the tests assert it is `false`.

## Verification

- Browser check (Playwright with `@axe-core/playwright`, Vite dev, mocks that follow the real API shapes, touch emulation at 390x844 and a mouse at 1440x900): `aria-hidden-focus` is gone from `/stats`; the other findings are tracked in #405 and #406.
- `npm run check`: see the PR.

## Audit scope of this round

`/reviews` and `/retrospectives` had no axe violation, no overflow, no text under 13px and no target under 44px (touch emulation) at 390x844. No real device or Lighthouse run.
