# #405 Let keyboard users scroll the heatmap

Issue: https://github.com/sirloinbh/study-log/issues/405 (epic #259). Found in the UX audit of 2026-11-24 (lane-4), second round.

## Purpose

The last-year heatmap is wider than a phone and scrolls inside `#heatmap-scroll`. It had no focusable content, so a keyboard user could not scroll it back to earlier months (axe `scrollable-region-focusable`, serious).

## Changes

- `frontend/src/heatmap.tsx`: the scroll container is a labelled region (`role="region"`, `aria-label="Heatmap of the last year, scrolls sideways"`) with `tabIndex={0}` and a 3px focus outline.
- `frontend/src/stats.test.tsx`: the region is named and takes focus.

## Verification

- Browser check (Playwright + axe, Vite dev, mocks that follow the real API shapes): axe finds no violation on `/stats`, `/reviews` or `/retrospectives` at 390x844 (touch) and 1440x900, and in dark mode at 390. With the region focused, pressing ArrowLeft five times moved `scrollLeft` from 122 to 0; the focus outline is solid 3px.
- `npm run check`: see the PR.

## Limits

The heatmap's own cells stay mouse-only (title tooltips); the region carries one summary for screen readers, as before.
