# Use distinct menu icons for Week and 12 weeks (#435)

## Purpose

The 2026-11-26 UX audit of the #420 nav: Week and 12 weeks shared one calendar icon, next to the Schedules and Reviews calendar icons.

## Changes

| File                        | Change                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `frontend/src/app.tsx`      | Week uses `Rows3`, 12 weeks uses `Grid3x3` (already in lucide-react; no new package). |
| `frontend/src/app.test.tsx` | No two menu entries share an icon.                                                    |

## Verification

See the PR.
