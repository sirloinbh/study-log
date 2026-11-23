# 347: Move the study pattern layout to Tailwind

## What changed

- `study-pattern.tsx` styles itself with Tailwind classes. The `.study-pattern`, `.pattern-*` rules are removed from `style.css` (892 to 829 lines).
- The weekday bars carry `data-bar`, the hour columns `data-hour`, and the busiest hour also `data-top`, so tests no longer read class names.

## Tests

- `retrospectives.test.tsx` reads `data-bar` and `data-hour`, and checks that only hour 21 has `data-top`.

## Browser check (Vite, mock API, Chromium, Retrospectives page)

- 1440x900: compared with `main` in the same dev server. All 97 elements of the card have the same position, size, colours, borders, radius, margins and gaps.
- 390x844: no page overflow; 24 hour columns with one highlighted (primary colour) and the others the 18% tint; weekday bars stay inside the card.

## Checked

`npm run check`, `node .standards/check.mjs`: see the PR.
