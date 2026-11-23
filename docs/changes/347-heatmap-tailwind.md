# 347: Move the heatmap layout to Tailwind

## What changed

- `heatmap.tsx` styles itself with Tailwind classes. The rules for `.heatmap-card`, `.heatmap-scroll`, `.heatmap`, `.heat-days`, `.heat-week`, `.heat-month`, `.heat-cell` (and its levels) and `.heat-legend` are removed from `style.css` (975 to 892 lines).
- The level looks live in `heatCellStyle` in `study-stats.ts`: level 0 keeps the muted fill with a 1 px inset border outline, levels 1 and 2 are 9% and 18% tints of the text colour, level 3 is the ring colour, level 4 the primary colour, and a day in the future draws nothing.
- Cells and week columns carry `data-level` and `data-week` so tests read the level without a class name.

## Tests

- `stats.test.tsx` reads `data-level` and `data-week` instead of `.heat-cell` and `.heat-week`, and finds the legend by its role and name.
- `study-pattern-a11y.test.tsx`: the test that parsed `style.css` text now checks that every level of `heatCellStyle` is distinct (levels 1 and 2 must differ).

## Browser check (Vite, mock API with a year of data, Chromium)

- 1440x900: compared with `main` element by element. All 376 cells have the same background, outline, radius and size; all 502 elements of the card have the same height. Text widths were not compared because the baseline copy could not load the web font.
- 390x844: no page overflow; the heatmap scrolls inside its card and the weekday column stays pinned at the left; all six looks (levels 0 to 4 and future) render.

## Checked

`npm run check`, `node .standards/check.mjs`: see the PR.
