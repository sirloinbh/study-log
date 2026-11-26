# Show the 12-week captions at 13px (#452)

## Purpose

The 2026-11-27 real-site UX audit found 14 text elements at 12px on `/twelve-weeks` (the year / "This week" caption and each "N of 7 days" line). The audit criterion and the heatmap decision (#411) set 13px as the smallest text.

## Changes

| File                                | Change                                                            |
| ----------------------------------- | ----------------------------------------------------------------- |
| `frontend/src/twelve-week-view.tsx` | Both caption spans use `text-[13px]` instead of `text-xs`.        |
| `frontend/src/week-view.test.tsx`   | The 12-week list has no `text-xs` element; the captions are 13px. |

## Verification

See the PR.
