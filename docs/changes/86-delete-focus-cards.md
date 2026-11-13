# #86 Focus is lost when switching the delete confirmation on the exercises, table of contents, and keywords screens

- Issue: [#86](https://github.com/sirloinbh/study-log/issues/86) (found while working on #65)
- Branch: `fix/86-delete-focus-cards`

## Problem

In #65 I added a focus move to the delete flow of the study log and textbook screens. But the exercises card, the table of contents card, and the keywords screen, which use the same 2-step delete, let focus fall to the page when the button is swapped. The keywords screen handled only after the delete, and the delete -> confirm and cancel steps were not handled.

## Changes

It is the same rule as #65.

| Step                                     | Focus                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Press "삭제" (Delete)                    | That item's "삭제 확인" (Confirm delete)                                                                          |
| Press "취소" (Cancel)                    | That item's "삭제"                                                                                                |
| Delete succeeds or already deleted (404) | The card title ("연습문제" / "목차") or that day's list title (keywords)                                          |
| Other failures                           | That item's "삭제" (for example 409 for a table of contents entry with study logs linked, where the item remains) |

- `frontend/src/Exercises.tsx`
  - Changed `wantFocus` from a boolean to an element id. The focus on the body after adding an exercise is still `'exercise-body'`.
  - Button ids `exercise-delete-<id>` and `exercise-delete-confirm-<id>`, and the title `exercise-heading` (`tabIndex=-1`)
- `frontend/src/TextbookContents.tsx`
  - Added the same `wantFocus` structure.
  - Button ids `content-delete-<id>` and `content-delete-confirm-<id>`, and the title `contents-heading`
- `frontend/src/Keywords.tsx`
  - Added the delete, confirm, and cancel steps. Button ids `keyword-delete-<id>` and `keyword-delete-confirm-<id>`
  - On failure, only 404 goes to the list title, and other failures go to the delete button. Before, it always went to the list title even on failure.

## Tests

- I added one per screen (`exercises-ui`, `textbook-contents-ui`, `keywords-ui`).
  - Delete -> confirm button, cancel -> delete button, 500 or 409 failure -> delete button, 404 or success -> title
  - As with the way strengthened in the #65 review, it passes only if the focus target id is exactly one in the rendered screen.
- I fixed 2 existing tests to match the new rule.
  - Exercises: it was "if you delete another exercise, focus stays". Now it goes through the confirm button to the card title, and it checks that the form being edited stays open.
  - Keywords: the focus order gained a "delete -> confirm button" step.
- I confirmed that the 3 new tests and the 2 fixed tests fail on the code before the fix, and all pass after the fix.

## Verification

| Command         | Environment                        | Result                                                       |
| --------------- | ---------------------------------- | ------------------------------------------------------------ |
| `npm run check` | Local, `TEST_DATABASE_URL` not set | exit 0. backend tests 176, pass 164, fail 0, skipped 12 (DB) |

- In a browser (Playwright Chromium, Vite + API + a local test DB), I checked with only the keyboard (Enter and Tab).
  - Mobile 390×844, the exercises card: delete -> confirm -> (Tab) cancel -> delete -> confirm -> confirm -> the "연습문제" title. I confirmed the delete through the API (404), and there is no horizontal scroll.
  - PC 1440×900, the table of contents card: the same flow moved to the "목차" title, and the chapter "8 지울 장" ("8 Chapter to delete") left the list. There is no horizontal scroll.
  - I checked the keywords screen with a UI test. The focus after delete is as I checked in the browser in #40.
- The look of the screen did not change, so I did not keep screenshots.

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no comments, so I do not do a second review. There is no issue to split off either.

- Confirmed points
  - In the three screens, `remove` decides the focus on failure and then throws the error again. So the notice and 404 handling of `run` still work.
  - Focus is moved after the reload finishes and the button is enabled.
  - The ids do not collide. The table of contents tree ids contain the item id, and the important exercises card does not use these ids.
  - The body focus for adding and editing an exercise is unchanged.
  - It does not conflict with the auto focus of the table of contents editor.
- Note (applied): I deleted an old comment line left above `wantFocus`. The behavior does not change.

## Limits and follow-up

- In the rare case where the item is gone from the list reloaded after a failure (deleted elsewhere), there is no delete button to focus. It is the same limit as #65.
