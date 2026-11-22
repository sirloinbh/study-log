# Fix English plurals and verb-first button labels (#281)

## Purpose

Screens said "1 days late", "1 reviews today" and "1 study days", and action buttons were announced with the verb last ("... log delete").

## Changes

| File                                                                                                 | Change                                                                                            |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `frontend/src/plural.ts`                                                                             | New `plural(count, singular, pluralForm?)`, for example `plural(1, 'day')` is "1 day"             |
| `reviews.tsx`, `review-badge.tsx`, `heatmap.tsx`, `stats.tsx`, `textbook-stats.tsx`, `schedules.tsx` | Every count of days, reviews and study days goes through `plural`                                 |
| `reviews.tsx`, `schedules.tsx`, `study-logs.tsx`, `textbook-contents.tsx`, `textbooks.tsx`           | `aria-label`s are now "<Verb> <object>: <name>", for example "Delete log: 2026-10-21 09:00–10:30" |
| `frontend/src/plural.test.ts`                                                                        | Unit test for `plural`                                                                            |
| Existing `*.test.tsx` files                                                                          | Buttons are found by the new names (assertion changes only)                                       |

Keyword and exercise labels were not in the issue and keep their old wording.

## Verification

- `rg "\} days|\} reviews|study days" frontend/src --glob "!**/*.test.*"` finds nothing.
- `npm test -w frontend`: 521 passed, 3 skipped.
- `npm run check`: see the PR.
