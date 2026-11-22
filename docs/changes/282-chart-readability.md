# Make study charts distinguishable and readable (#282)

## Purpose

Heatmap levels 1 and 2 looked the same, and the hour chart's values were only in tooltips.

## Changes

| File                                       | Change                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `frontend/src/style.css`                   | `.heat-cell.level-1` mixes 9% of the foreground instead of 18%, lighter than level 2          |
| `frontend/src/study-pattern.tsx`           | The bars are `aria-hidden`; a visually hidden list "Study time by hour" has each hour's value |
| `frontend/src/study-pattern-a11y.test.tsx` | Finds the hour values by text; checks levels 1 and 2 have different backgrounds               |

## Verification

- `npm test -w frontend -- study-pattern`: 2 passed. Levels are compared in the stylesheet text because Vitest does not load CSS.
- `npm run check`: see the PR.
