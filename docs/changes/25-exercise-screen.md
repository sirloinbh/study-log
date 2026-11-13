# #25 Exercise input and view screen + clipboard copy for AI questions

- Issue: [#25](https://github.com/sirloinbh/study-log/issues/25) (parent #5)
- Branch: `feat/25-exercise-screen`
- Prerequisites: #24 exercise DB and API, #22 table of contents screen (both merged)

## Purpose

Enter and view the exercises for each chapter and section of a textbook on the screen, and copy them straight into a question format so you can ask an AI.

## Changes

- `frontend/src/Exercises.tsx`: the exercises card. When you pick a textbook on the textbook screen, it appears under the table of contents card.
  - The "단원" ("Chapter") select: pick from the chapters and sections of the table of contents in reading order. At first the first chapter is selected. If there is no table of contents, it shows "목차를 먼저 추가하면 장·절별로 문제를 입력할 수 있습니다" ("Add a table of contents first and you can enter problems per chapter and section"), and "문제 추가" ("Add problem") is disabled.
  - List: shows the chosen chapter's problems in the order they were added (the #24 API order).
    - The name uses the number like "문제 3" ("Problem 3"), and if there is no number, it uses the list order like "2번째 문제" ("2nd problem").
    - An important problem gets an "중요" ("Important") badge.
    - The body is shown with the line breaks and indentation as entered.
  - "문제 추가": enter the problem number (20 characters), the important mark, and the problem body (20000 characters).
    - Even after adding, the input form stays open and empty. You can enter several problems in a row, and focus goes back to the body field.
    - You close it with "닫기" ("Close").
  - "수정" ("Edit") changes the number, body, and important flag with `PUT /api/exercises/:id` and closes the form.
  - "삭제" ("Delete") runs only after you press "삭제 확인" ("Confirm delete") once more.
  - If you save a problem deleted elsewhere, it shows the server message ("연습문제를 찾을 수 없습니다", "Exercise not found"), closes the form, and loads the list again. For other failures (for example a body of only spaces), it shows the message and keeps the input.
  - The state is marked with the chapter ID like the table of contents card. If you pick another chapter, the list, form, and message of the previous chapter are not visible. It sends only one request at a time, and locks the buttons and the chapter select until the change and the list refresh after it finish. "질문 복사" ("Copy question") only reads, so it is not locked.
  - If the table of contents cannot be loaded, it shows "목차를 불러오지 못해 단원을 고를 수 없습니다" ("Could not load the table of contents, so you cannot pick a chapter").
- Question copy: each problem has a "질문 복사" button. It copies the format below with `navigator.clipboard.writeText` and shows "문제 3 질문을 복사했습니다" ("Copied the question for problem 3").

  ```text
  교재: 선형대수 (Strang · 5판)
  단원: 1 벡터 > 1.2 내적
  문제 번호: 3

  <문제 본문>

  이 연습문제의 풀이를 단계별로 설명해 주세요. 필요한 개념도 함께 알려 주세요.
  ```

  (In English: "Textbook: Linear algebra (Strang · 5th edition) / Chapter: 1 Vectors > 1.2 Inner product / Problem number: 3 / the problem body / Please explain the solution of this exercise step by step. Also tell me the concepts that are needed.")

  - If the author and edition are empty, the parentheses are left out, and if there is no number, the "문제 번호" ("Problem number") line is left out.
  - Blank lines before and after the body are removed, and line breaks and indentation inside the body are kept.
  - The chapter is the path from the chapter to that section.
  - If the clipboard cannot be used (no API, permission denied), it shows "클립보드에 복사하지 못했습니다. 문제 본문을 직접 선택해 복사하세요" ("Could not copy to the clipboard. Select and copy the problem body yourself"). The body is still on the screen.

- `frontend/src/exercise.ts`: pure functions the screen and tests share.
  - `questionText`: the copy format
  - `contentPath`: finding the chapter -> section path in the tree
  - `exerciseLabel`, and the input limits
- `frontend/src/TextbookContents.tsx`: it reports the table of contents tree it shows and whether the first load failed (`failed`) with `onTree`.
- `frontend/src/Textbooks.tsx`: it passes the received tree and the failure flag to the exercises card (`tree`, `treeFailed`). If you add a chapter on the table of contents card, it shows up right away in the chapter select of the exercises. The exercises card does not load the table of contents separately.
- `frontend/src/style.css`: the spacing of the chapter select and input form, the alignment of the important checkbox, and keeping body line breaks (`pre-wrap`).

## Tests

`backend/test/exercises-ui.test.ts` (the existing React stand-in for tests, 19 tests):

- Auto selecting the first chapter and the list order, the important badge, whether changing the chapter requests that chapter's list, and the empty chapter notice
- The notice for a textbook with no table of contents and "문제 추가" disabled
- The add request body (the number, a body with line breaks, and the important flag)
  - Whether the form stays open and empty after adding
  - Whether focus goes to the body field when the form opens and after adding (after the request ends)
- The form closes after the edit PUT, and delete confirmation and cancel
- The server message and keeping the input on save failure, and the form closing when saving a problem deleted elsewhere
- The whole copy text (textbook, author, edition, chapter -> section path, number, and body), and the notice when there is no clipboard or it is denied
- Whether a chapter added on the table of contents card shows up right away in the chapter select
- Button accessibility names ("문제 3 질문 복사" and so on)
- Added after the review fixes (6 tests):
  - Whether focus is not moved when you delete another problem with the form open
  - The table of contents load failure notice
  - Whether the form and list of the previous textbook are not visible when you change the textbook
  - Whether the form hides when you change the chapter and the input you were writing is as it was when you come back
  - Locking the buttons and the chapter select during a request (except question copy)
  - The 404 notice and refresh when deleting an already deleted problem
- `questionText` handling of an empty number, an empty author/edition, and blank lines before and after the body, and `contentPath`

## Verification

| Command and environment                                           | Result                                                                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run check`, `TEST_DATABASE_URL` set (local PostgreSQL 17.11) | exit 0. backend tests 104, pass 104, fail 0, **skipped 0**, skills 4 pass, build passed                          |
| headless Chrome (CDP) 1440×900, the real API + the local test DB  | All the flows below as expected. The page errors were only the `favicon.ico` 404 (existing) and one intended 400 |
| headless Chrome (CDP) 390×844                                     | No horizontal scroll (`scrollWidth` 390 = `innerWidth` 390), button height 44px, and copy works                  |

- The local test DB was missing migrations 004 to 007, so I applied them with the `psql -f` method in `docs/next-steps`. Before that, 5 integration tests failed (no table).
- Browser check:
  - Method: I started the local Chrome headless and operated it with the DevTools protocol. The Chrome extension is not connected yet. I actually read the clipboard to check, with a CDP permission grant and focus emulation.
  - Data: I made a "브라우저확인 …" ("Browser check …") textbook through the API (connected to the test DB) to check, and deleted it afterward (confirmed 0 textbooks and exercises).
- Flows checked (PC):
  1. Pick a textbook -> the first chapter is selected, "이 단원에 입력한 문제가 없습니다" ("There are no problems entered for this chapter")
  2. Pick "1.2 내적과 길이" ("1.2 Inner product and length") -> 2 problems, line breaks and indentation kept
  3. Copy question -> it goes into the clipboard in exactly the format above. It is a Windows clipboard, so line breaks read as CRLF. "문제 3 질문을 복사했습니다"
  4. Add a problem -> focus on the body field -> save -> "추가했습니다" ("Added"), the form stays empty, and focus is on the body field again
  5. Edit -> "수정했습니다" ("Edited"), the form closes
  6. A body of only spaces -> the server 400 "문제 본문을 입력하세요"
  7. Delete confirmation -> "삭제했습니다" ("Deleted")
  8. Add a chapter on the table of contents card -> it shows up right away in the chapter select
- A problem I found in the browser and fixed: at first, after adding, focus fell to `BODY`. When the form was redrawn, the body field was still disabled (waiting for the refresh), so `autoFocus` did not take effect. I changed it to move focus with an effect after the request ends and the field is enabled, and added a test. I confirmed again in the browser.
- Screenshots: [PC 1440×900](assets/25-pc-1440x900.png), [mobile 390×844](assets/25-mobile-390x844.png). That the sidebar in the PC capture is cut off in the middle is the result of capturing the fixed sidebar together at the scroll position (the same as #11 and #22).

## Limits and follow-up

- The list order is the order they were added. I did not sort by number because the number is free form, such as "3", "3a", and "연습 2" ("Exercise 2").
- There is no feature to move a problem to another chapter (not in the #24 API).
- The important problem filter and the important toggle in the list are in the scope of #27. On this screen, you decide the important flag in the input and edit form.
- Entering and expanding answers is added on top of this card in #26.
- Losing focus when the delete confirmation switches is the same problem as on other screens and is handled together in #65.
- The copy wording had no format set in the issue, so I decided the format above. To change it, only `questionText` needs to be fixed.
- The problem that the table of contents is not updated if you add to a chapter deleted elsewhere: [#74](https://github.com/sirloinbh/study-log/issues/74)
- Preventing a duplicate submit in the same tick: [#75](https://github.com/sirloinbh/study-log/issues/75)

## Automated code review, round 1

A separate read-only review agent reviewed the issue #25 done criteria and the whole PR diff. There were no high comments. It was confirmed that in a real React there is no render loop, and there is no problem with the textbook and chapter switching state handling or with security (only text rendering is used).

Comments applied:

1. (medium) Focus: it focused the body field again every time `busy` was released, so if you deleted another problem with the form open, focus was pulled to the form.
   - I changed it to a `wantFocus` state that requests focus only when the form opens and right after adding. It moves once after the request ends and the field is enabled.
   - I added a test.
2. (low-medium) If the table of contents load failed, the exercises card stayed at "목차를 불러오는 중…" ("Loading the table of contents…").
   - I made `onTree` also report `failed`. The card shows a failure notice.
3. (low) Passing a new function to `onTree` on every render could cause an infinite render. I stated in a comment that it must be a stable function (a state setter). The React stand-in for tests cannot catch this case.
4. (low) I wrote in the docs that "질문 복사" is not locked.
5. (low) I added 6 missing tests (the test list above).
6. (low) The "중요" badge borrowed the completed state style (`badge done`). I changed it to a dedicated `badge important` (an accent color).

Comments split off (outside this PR's scope):

- If you add to a chapter deleted elsewhere, the table of contents card is not updated and you cannot get out. It is a fix across two cards -> #74
- `if (busy) return` is a render-time value, so it cannot block a duplicate submit in the same tick. It is the same pattern as the table of contents card and a fix that applies in common to several screens -> #75

Verification after the fixes:

- `npm run check` (including the DB): exit 0. backend tests 110, pass 110, fail 0, skipped 0. Skills 4 pass, build passed.
- I checked the browser flows again. Focus on the body after adding, copy, edit, the 400 notice, delete, and reflecting an added chapter all work as before. There is no horizontal scroll on mobile.
- I retook the screenshots with the new badge color.

## Automated code review, round 2

A separate read-only review agent checked the first-round fix commit (36b9e29) and the whole final PR diff again. The review is limited to 2 rounds, so I do not do a third.

- It was confirmed that the 6 first-round fixes are right on a real React 19 basis and nothing is missing.
  - Focus: it moves only when opening, when switching the edit target, and after the request ends following an add. It does not move because of a delete.
  - `failed`: it is true only when the tree was never shown. It is reset when you change the textbook.
  - Adding `error` to the dependencies of `onTree` (a state setter) does not create a render loop.
- There were no new bugs or high or medium comments. #74 and #75 were not pointed out again.
- Comment (low, docs): passing `failed` and `treeFailed` was missing from the change list. I reflected it in the change list above.
- This commit changed only docs. The code verification result is the result after the first-round fix (110 pass, 0 skip).
