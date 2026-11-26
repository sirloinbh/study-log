# Stop the Coding problem search hint being cut off on a phone (#453)

## Purpose

The 2026-11-27 real-site UX audit at 390x844: the "Find a problem" placeholder "Title, Baekjoon number or LeetCode link" was cut off after "LeetCode lin" in the 308px field.

## Changes

| File                                    | Change                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `frontend/src/coding-quick-log.tsx`     | The placeholder is now "Title, number or link". The label is unchanged.           |
| `frontend/src/coding-problems.test.tsx` | The hint is at most 28 characters and the field keeps its "Find a problem" label. |

## Verification

See the PR.
