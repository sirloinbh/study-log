# 347: Move the calendar layout to Tailwind

## What changed

- `calendar.tsx` and the header row of `retrospectives.tsx` use Tailwind classes. Removed from `style.css` (731 to 710 lines): `.calendar-head`, `.calendar-grid`, `.calendar-weekday`, `.calendar-day` (studied, today, selected states), `.calendar-date`, `.calendar-minutes`, `.calendar-logs h3`.
- States: a studied day gets `bg-muted`, the selected day is styled by `aria-pressed:` (primary border and inset ring), and today's date number is bold in the primary colour.
- The grid carries `data-calendar-grid` for the test.

## Tests

- `calendar.test.tsx` finds the grid by `data-calendar-grid`, and checks today's date number is bold instead of matching a `today` class.

## Browser check (Vite, mock API with three studied days, Chromium, Study log page)

- 1440x900: compared with `main` in the same dev server. All 34 elements of the card match in position, size, colours, spacing, border and radius. The only difference is how the selected day's inset ring is written in computed style (Tailwind adds transparent shadow layers); the visible ring is the same primary 1 px inset.
- 390x844: no page overflow; seven 41 px columns; three studied days shaded; selected day has the primary border; today's number is bold.

## Checked

`npm run check`, `node .standards/check.mjs`: see the PR.
