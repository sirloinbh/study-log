# #395 Make the schedule day checkboxes easy to tap

Issue: https://github.com/sirloinbh/study-log/issues/395 (epic #259). Found in the UX audit of 2026-11-24 (lane-4).

## Purpose

The "complete day" checkbox was an 18x18px control, below the 44x44px rule, next to a Move button.

## Changes

- `frontend/src/schedule-days.tsx`: the checkbox and the date text are inside one `<label>` (`schedule-day-check`), so tapping the date also toggles the day. The checkbox keeps its `aria-label` (`Complete day: <date>`), so its accessible name and the focus handling are unchanged.
- `frontend/src/style.css`: the label is at least 44px high (`min-h-11`); the "Move later days too" label goes from 36px to 44px.
- Tests: tapping the date completes a day (`schedules.test.tsx`); the 44px rules (`style-rules.test.ts`).

## Verification

- Browser check (Playwright, Vite dev, mocked `/api`, a two-day schedule): the label measures 164x44px and 118x44px at 390x844 and 766x44px / 720x44px at 1440x900; no horizontal overflow at either size.
- `npm run check`: see the PR.

## Limits

The 18px box itself is unchanged; the touch target is the label around it. The shared Button is 36px high (managed file, central repo).
