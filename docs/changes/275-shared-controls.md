# Move screen buttons, inputs and selects to the shared components (#275, step 1)

## What changed

- Buttons that used the `.primary`, `.secondary` and `.danger` classes are now `Button` (`default`, `outline`, `destructive`); the toggle buttons in Reviews, Retrospectives, Stats and the study time chart pick the variant from their state.
- Text, date, time, number and search inputs are `Input`; selects are `NativeSelect`.
- Deleted the freed rules from `style.css` (1001 to about 975 lines), and added `grid-template-columns: minmax(0, 1fr)` to the screen grids: the shared controls are wider than the old ones and made the Textbooks screen scroll sideways by 3 px at 390 px.
- Not in this step: `ConfirmDialog`, textareas, checkboxes, and moving layout CSS to Tailwind (the `style.css` under 400 lines target stays open).

## Checked

- `npm run check`, `node .standards/check.mjs`.
- Browser at 390x844 and 1440x900 (Vite, mocked /api): Study log, Schedules, Textbooks, Keywords, Reviews, no sideways scroll.
