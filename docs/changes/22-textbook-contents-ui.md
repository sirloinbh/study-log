# #22 Manual input and edit screen for the table of contents

- Issue: [#22](https://github.com/sirloinbh/study-log/issues/22) (parent #5)
- Branch: `feat/22-textbook-contents-ui`
- Prerequisites: #13 textbook table of contents DB and API, #21 textbook screen (both merged)

## Purpose

Even before automatic generation of the table of contents (#23), let you enter and fix the chapters and sections of a textbook directly on the screen.

## Changes

- `frontend/src/TextbookContents.tsx`: the table of contents card. When you pick a textbook on the textbook screen, it appears under the list and detail.
  - It shows the table of contents as a tree. Sections are indented and grouped by a line on the left. If there is no table of contents, "아직 목차가 없습니다" ("There is no table of contents yet").
  - "장 추가" ("Add chapter"): adds a top-level chapter at the end.
  - Five buttons per item: up, down, add below, edit, and delete.
    - Up and down swap places with a neighbor within the same parent entry, and save the order of all siblings with `PUT /contents/order`. Up on the first and down on the last are disabled.
    - Add below adds at the end under that item.
    - Edit changes the number and the title.
    - Delete runs only after you press "삭제 확인" ("Confirm delete") once more, and it deletes the items under it too.
  - Only one editor opens, at the top of the table of contents card.
    - Titles: "장 추가", "'1 벡터' 아래에 추가" ("Add under '1 Vectors'"), and "목차 수정" ("Edit table of contents")
    - Each time it opens, focus goes to the "목차 제목" ("Table of contents title") field (`autoFocus`, and if the target changes, the form is redrawn).
  - Server errors (409 for deleting a table of contents entry that has study logs linked, and so on) are shown with the server's Korean message, and the table of contents is loaded again.
    - A 404 closes the editor only when it is about the item being edited (or the textbook).
  - During a request, the inputs and buttons are locked.
  - The table of contents, editor, delete confirmation, and notice states are kept with the textbook ID attached. If you change the textbook, the table of contents or editor of the previous textbook is not shown. In a real React it is also redrawn with `key`.
- `frontend/src/Textbooks.tsx`: if a textbook is selected, attach the table of contents card.
- `frontend/src/style.css`: the styles for the table of contents tree, rows, and the edit form. On mobile the indentation is reduced. The buttons wrap.

## Tests

- `backend/test/textbook-contents-ui.test.ts` (a fake table of contents API, request records), 11 at first (13 after the first review)
  - When a textbook is selected, the tree is shown and the first request is `GET /api/textbooks/1/contents`, and switching textbooks
  - The empty table of contents notice
  - Add chapter -> add below: the POST body (`parentId` null / the parent ID), reloading the tree, and the editor closing
  - Edit: filling the form, the PUT body, and reflecting in the tree
  - Up and down: both ends disabled, the `PUT /order` body that sends the order of all siblings, and reordering top-level chapters
  - Delete confirmation and cancel, and deleting the items under it together
  - Showing the 409 (study log linked) message, and the edit of another item is kept
  - Saving an edit of an item deleted elsewhere (404) -> the editor closes and the tree is updated
  - If you change the textbook, the editor of the previous textbook closes
  - The `aria-label` of the row buttons
  - A unit check of `contentLabel`
- `backend/test/ui-harness.ts`: `submit` takes a scope and submits the form inside it. It is needed because the textbook screen has two forms.
- `backend/test/textbooks-ui.test.ts`: the fake API answers the table of contents request with an empty table of contents.
- I named the title label of the table of contents form "목차 제목" ("Table of contents title") so it is told apart from "제목" ("Title") in the textbook registration form.

## Verification

| Command             | Environment                                           | Result                                                                                                                    |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`     | Local, `TEST_DATABASE_URL` not set                    | exit 0. backend tests 78, pass 73, fail 0, **skipped 5** (DB integration), skills 4 pass, build passed                    |
| Playwright 1440×900 | An in-memory table of contents API (3102) + Vite 5202 | All the flows below as expected. 0 page errors                                                                            |
| Playwright 390×844  | The same environment                                  | No horizontal scroll (`scrollWidth` 375, the difference is the vertical scrollbar), 0 row overflow, buttons at least 44px |

- The 5 skipped are the existing DB integration tests (no local test DB, run in CI). This change is the screen only, and I did not change the API or the DB.
- I did the browser check with an in-memory HTTP server that answers by the API rules. I did not put it in the repository. Server validation and DB behavior are covered by the integration tests of #13 and #14.
- Flows checked:
  1. Pick "선형대수와 그 응용" ("Linear algebra and its applications") -> the tree "1 벡터와 선형방정식 › 1.1, 1.2 / 2 행렬" ("1 Vectors and linear equations › 1.1, 1.2 / 2 Matrices")
  2. Add the chapter "3 행렬식" ("3 Determinants") and add "2.1 행렬 곱셈" ("2.1 Matrix multiplication") under "2 행렬"
  3. Move "1.1" down -> the order 1.2, 1.1
  4. Edit "1.2" -> "수정했습니다" ("Edited")
  5. Delete a table of contents entry with a study log linked -> "학습 기록이 연결된 목차는 삭제할 수 없습니다" ("A table of contents entry with linked study logs cannot be deleted")
  6. Delete "3 행렬식" -> "삭제했습니다" ("Deleted")
  7. In the first check, focus did not go to the title field on edit and add (because the editor appears in the next render). After I fixed it with `autoFocus`, I confirmed again that edit, editing another item, and add chapter all give focus to "목차 제목".
- The console errors were only the `favicon.ico` 404 (existing) and the intended 409 of step 5.
- Screenshots: [PC 1440×900](assets/22-pc-1440x900.png), [mobile 390×844 table of contents card](assets/22-mobile-390x844.png).
  - That the sidebar appears from the middle in the PC full page capture is the result of capturing a scrolled page and the fixed sidebar together (same as the #11 record).

## Automated code review, round 1

A separate read-only review agent reviewed the issue #22 done criteria and the PR changes.

- Points confirmed to have no problem:
  - State management with the textbook ID attached
  - The 404 handling rule
  - Reordering (the same sibling array and the parent ID)
  - The form key and `autoFocus`
  - No CSS regression
  - The number of tests and the docs
- There were no high or medium comments.
- Comment (low): the lock was released before the reload right after a change finished.
  - If you pressed "up" right after adding a chapter, the reorder was sent with the old list that lacked the new chapter, and the server rejected it.
  - A late reload could also overwrite the result of the reorder.
  - Applied:
    - I moved the reload inside the change handling, so the lock is kept until the reload finishes.
    - A reorder uses the new tree in the response as it is.
    - I removed the reload effect, which also removed the late response race.
    - A reload failure is shown next to the existing list as "목차를 불러오지 못했습니다" ("Could not load the table of contents").
  - Test: it checks that the buttons are locked while the reload is held back. It fails on the code before the fix and passes after.
  - Test: it checks that if a reorder is rejected, the message is shown and it loads again.
- Comment (low): the accessible name of the "add below" button ("… 아래에 추가", "Add under …") had no visible text (WCAG 2.5.3).
  - Applied: I changed it to "… 하위 추가" ("… add below"). I changed the test expected value too, and it fails on the code before the fix.
- Comment (low): while a reorder or save fails, the buttons and inputs are disabled and focus is lost.
  - Split: I added the scope to [#65](https://github.com/sirloinbh/study-log/issues/65), which has the same cause (an issue comment).
- Comment (low): if the first lookup fails, the only way to try again is to pick the textbook again.
  - Recorded in the limits below.
- Comment (low): the test title "select options" did not match the actual check.
  - Applied: I fixed the title.
- Verification: `npm run check` exit 0. tests 80, pass 75, fail 0, skipped 5 (DB integration).

## Automated code review, round 2

A separate read-only review agent checked the first-round fix (ae4048d) and the final changes again. The review is limited to 2 rounds, so I do not do a third.

- Points confirmed:
  - Closing or keeping the editor before and after the reload
  - The reload does not clear the notice
  - Releasing the confirm state when a delete fails
  - No leftover reference to the removed `setReload`
  - The lock test observes the real lock state
- There were no code comments and no issue to split off.
- Note (low):
  - If a reorder is 404, it closes the editor even when unrelated to the item being edited. A 404 on reorder happens only when the textbook or the siblings are gone, so I keep it closing while loading the table of contents anew.
  - If the change succeeded but the reload fails, the previous table of contents stays with an error. It is the intended behavior.

## Limits and follow-up

- If the first lookup fails, "장 추가" stays disabled. If you pick the textbook again, it loads again. There is no retry button.
- The React stand-in for tests ignores `key`, so the behavior of hiding state when you change the textbook is verified only by the textbook ID tag. In a real browser it is redrawn with `key`.

- Moving under another chapter is not in the API (#13), so it is not supported.
- On mobile, the five buttons per item wrap to two lines. If the table of contents gets long, grouping them in a menu button can be considered.
- Losing focus when the delete confirmation button switches is handled together with other screens in #65.
