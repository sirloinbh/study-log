# Show English text on date and time fields (#447)

## Purpose

The browser's native date and time inputs write their parts and calendar in the browser's language ("연도 / 월 / 일" in a Korean browser); `<html lang="en">` does not change that. The screens now use the UI kit's `DateField` and `TimeField` (project-standards#1138, PR #1139, synced in #454).

## Changes

| File                                  | Change                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/picker-fields.tsx`      | `DateInput` and `TimeInput`: a text beside the kit's `DateField` or `TimeField`. The text is a `<label for>` and not a wrapping label (a wrapper would add the calendar button's name to the field's name). `onChange` takes the same `{ target: { value } }` shape as an input's, so the screens' handlers are unchanged. |
| 10 screen files                       | All 17 native date and time inputs are replaced: study log form (1 date, 2 time), study log search (2), keyword form (1), keyword search (2), schedule create (2), schedule day move (1), reviews due date (1), data export (2), coding attempt (1 date, 1 time), coding goal target date (1).                             |
| `frontend/src/style.css`              | `.picker-field` (text above the field); the phone rule that gives the first form field the full width includes it; the old `input[type='date']` rule is gone.                                                                                                                                                              |
| `frontend/src/keywords.test.tsx`      | "Dates cannot cross" now checks the calendar: days before the start and after the end are disabled.                                                                                                                                                                                                                        |
| `frontend/src/picker-fields.test.tsx` | Name and label, typing, picking, clearing, `min`, the time list, and no native date or time input.                                                                                                                                                                                                                         |

## What changed for the person using it

- The field is a text field (`YYYY-MM-DD`, `HH:MM`) with a calendar or time list button. Typing and pasting still work.
- `min` and `max` now limit what the calendar picks. The browser no longer refuses a typed date outside them or a start after the end on submit; the server and the form messages still do (for example "The start date cannot be after the end date").

## Verification

- `npm run check`: see the PR.
- Browser check (Playwright + axe, Vite, Chromium with locale ko-KR, mocked API) on /, /schedules, /keywords, /reviews, /settings and /coding at 390x844 touch and 1440x900: no native date or time input, no axe violation, no sideways overflow. A script that fills every date and time field with a full value found none clipped at 390, 780, 900, 960, 1000, 1100, 1200 and 1440px wide (before the CSS change: clipped at 390 and from 761 to 960).
