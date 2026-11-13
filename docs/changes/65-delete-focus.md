# #65 Keyboard focus is lost when switching the delete confirmation button

- Issue: [#65](https://github.com/sirloinbh/study-log/issues/65) (split from the PR #64 review)
- Branch: `fix/65-delete-focus`

## Problem

Delete on the study log screen and the textbook screen is a 2-step confirmation that swaps the button. At each step, the button that had focus disappears and focus falls to the page (`<body>`). So keyboard and screen reader users had to Tab again from the start at every step.

## Changes

I applied the same rule to both screens. After redrawing, once the button is enabled, give focus to a predetermined element.

| Step                           | Focus                                                     |
| ------------------------------ | --------------------------------------------------------- |
| Press "삭제" (Delete)          | That item's "삭제 확인" (Confirm delete)                  |
| Press "취소" (Cancel)          | That item's "삭제"                                        |
| Delete succeeds                | The list title ("최근 기록" / "교재 목록", `tabIndex=-1`) |
| Already deleted (404)          | The list title                                            |
| Other failures (500 and so on) | That item's "삭제" (because the item remains)             |

- `frontend/src/StudyLogs.tsx`: attached `study-log-delete-<id>` and `study-log-delete-confirm-<id>` to the buttons and the `study-log-list` id to the title.
- `frontend/src/Textbooks.tsx`: attached `textbook-delete` and `textbook-delete-confirm` to the buttons and the `textbook-list` id to the title.
- The issue's scope is the two screens. The exercises and table of contents cards and the keywords screen, which use the same 2-step delete pattern (delete -> confirm, cancel steps), were split into [#86](https://github.com/sirloinbh/study-log/issues/86).

## Tests

- `backend/test/study-logs-ui.test.ts`, `backend/test/textbooks-ui.test.ts` (2 each)
  - Delete -> confirm button, cancel -> delete button, confirm -> list title (`tabIndex=-1`)
  - 500 failure -> delete button, 404 -> list title
- I confirmed that 4 fail on the code before the fix and pass after the fix.

## Verification

| Command         | Environment                        | Result                                                       |
| --------------- | ---------------------------------- | ------------------------------------------------------------ |
| `npm run check` | Local, `TEST_DATABASE_URL` not set | exit 0. backend tests 165, pass 153, fail 0, skipped 12 (DB) |

- In a browser (Playwright Chromium, Vite + API + a local test DB), I checked with only the keyboard (Enter and Tab).
  - Mobile 390×844, the study log screen
    - Enter on "삭제" -> focus is on "삭제 확인"
    - Tab -> Enter on "취소" -> focus is on "삭제"
    - Enter -> Enter for a real delete -> focus is on the "최근 기록" title, "삭제했습니다" ("Deleted"), and I confirmed the delete through the API (404)
  - PC 1440×900, the textbook screen: the same flow moves to the textbook list title after confirm -> delete, and there is no horizontal scroll.
- Only the focus movement changed and the look of the screen did not, so I did not keep screenshots.

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no correctness problems or high comments. There is no issue to split off either.

- Confirmed points
  - The effect runs after `busy` is released, so focus goes to the enabled button.
  - The list title is always there, so it does not depend on an asynchronous reload.
  - The ids do not collide. They do not conflict with the existing focus code (edit and textbook selection) either.
- low (applied): the fake `getElementById` in the tests accepted any id, so it passed even with a typo in a button id.
  - I changed it so it passes only if the focus target id is exactly one in the rendered screen.
  - I confirmed that if I deliberately change the confirm button id wrongly, the test fails with "no element".
- low (kept)
  - If the item is gone from the list reloaded after a failure such as 500 (deleted elsewhere), there is no button to focus. It is a rare case.
  - I did not separately test that focus is not moved during a request.

## Automated code review, round 2

A separate read-only review agent checked the first-round fixes and the whole final PR again. The review is limited to 2 rounds, so I do not do a third.

- The test harness runs effects after redrawing. So it was confirmed that the strengthened focus check looks at the current screen and that there are no wrong failures.
- There were no code comments and no issue to split off. I only fixed the field name (`state.ui`) in a test comment.

## Limits and follow-up

- The same problem on the exercises, table of contents, and keywords screens is fixed in #86.
- The focus ring style follows the browser default. I did not style how it looks when the list title gets focus.
