# Keep keyboard focus after saving (#461)

## Purpose

Write-flow audit 2026-11-27: after Register (Textbooks), Add (Keywords) or Save (Retrospectives) the focus fell to the page (`BODY`), because `useBusy` users disable the focused submit button while the request runs.

## Changes

| File                             | Change                                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/busy.ts`           | `begin` remembers the focused element; when the request ends, focus returns to it if it fell to the page and the element is still there and enabled. A screen's own focus effect still wins. |
| `frontend/src/keywords.test.tsx` | The focus recorder skips elements with no id, so the button getting its focus back is not counted as a screen focus step.                                                                    |
| `frontend/src/busy.test.tsx`     | New: focus returns to the button; an explicit focus target is kept.                                                                                                                          |

## Verification

See the PR.
