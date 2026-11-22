# Split the large screen components (#276)

## Purpose

Six screens mixed forms, lists and async flows in files of 365 to 833 lines. Each screen file is now at most 400 lines.

## Changes

| Screen (lines before → after)       | New files                                                                                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schedules.tsx` (833 → 354)         | `schedule-create-form.tsx`, `schedule-list.tsx`, `schedule-detail.tsx`, `schedule-days.tsx`; notices are cleared by one `clearNotices`                                     |
| `exercises.tsx` (682 → 397)         | `exercise-answer.tsx` (answer panel), `exercise-actions.tsx` (item action bar), `exercise-form.tsx`, `exercise-toolbar.tsx`, `use-answer-panel.ts`, `use-exercise-data.ts` |
| `textbook-contents.tsx` (563 → 393) | `contents-paste-form.tsx`, `contents-entry-form.tsx`, `contents-tree.tsx`; `onTree` is read through a ref, so the tree effect no longer depends on its identity            |
| `study-logs.tsx` (484 → 253)        | `study-log-form.tsx`, `study-log-item.tsx`; form changes are `Partial<StudyLogForm>` patches typed per field (no string into `textbookId`)                                 |
| `keywords.tsx` (478 → 373)          | `keyword-form.tsx` (one form for add and edit), `keyword-search-card.tsx`                                                                                                  |
| `textbooks.tsx` (365)               | Unchanged, already under 400                                                                                                                                               |

Behaviour, labels and focus handling are unchanged. Two test changes:

- `study-logs.test.tsx`: the request-order check after saving waits with `waitFor` (the same flake fixed for `textbooks.test.tsx` in #336).
- New `textbook-contents-ontree.test.tsx`: an `onTree` that is a new function on every render does not loop or reload.

## Verification

- `npm test -w frontend`: 532 passed, 3 skipped.
- `npm run check`: see the PR.
