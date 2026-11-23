# Write the feature layout CSS with Tailwind @apply (#347, part 2)

## What changed

- `frontend/src/style.css` (screens, forms, contents, exercises, schedules, retrospectives, memo, badges) now uses Tailwind's `@apply` with the design tokens instead of plain declarations: 766 to about 470 lines. Class names and screens are unchanged, so no other lane's files are touched.
- Removed dead rules (`.empty`, `.primary/.secondary/.danger` in the narrow-screen block); merged duplicates (`.log-actions`, status/alert margins, field boxes).
- The calendar block stays for the lane that owns the calendar; the coding and attempt blocks belong to their lanes.
- `code` in memos now uses the token mono font stack.

## Checked

- Computed styles of every element under `.legacy` compared before and after at 390x844 and 1440x900 on Study log, Schedules (with day move and rename open), Textbooks (with paste and problem forms open), Keywords and Reviews: no difference except equivalent values (pill radius, `flow-start`, colour space) and the memo `code` font.
- `npm run check`, `node .standards/check.mjs`.
