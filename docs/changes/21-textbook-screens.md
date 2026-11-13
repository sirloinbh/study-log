# #21 Textbook list, detail, and register, edit, and delete screens

- Issue: [#21](https://github.com/sirloinbh/study-log/issues/21) (parent #5)
- Branch: `feat/21-textbook-screens`
- Prerequisite: #12 textbook basic info DB and API (merged)

## Purpose

Make the textbook API (`/api/textbooks`) built in #12 usable on the screen. Register a textbook, pick it from the list to see the detail, and edit and delete it.

## Changes

- `frontend/src/Textbooks.tsx`: the textbook screen.
  - Register form: title (required, 200 characters), author (200 characters), and edition (50 characters). The length limits are the same as the API, and the server validates again.
  - When you register, it clears the form and shows the new textbook in the detail. An edit is saved with PUT. After saving, it loads the list again from the server.
  - It shows the server's Korean validation messages (for example a title of only spaces -> "제목을 입력하세요", "Enter the title") with `role="alert"` and keeps the input.
  - List: it shows the title and "author · edition" in the server order (by title). Empty values are left out. If there is no list, it shows "아직 등록한 교재가 없습니다" ("No textbooks registered yet"), and if the lookup fails, "교재 목록을 불러오지 못했습니다: …" ("Could not load the textbook list: …"). Even on failure, the list already showing is kept.
  - Detail: when you press a title in the list, it shows the title, author, and edition. An empty value is shown as "—". You edit and delete from the detail. The detail follows the list data, so a textbook deleted elsewhere also disappears from the detail at the next lookup.
  - Delete runs only after you press "삭제 확인" ("Confirm delete") once more. You can cancel at the confirm step.
  - It follows the same rules as the study log screen.
    - During a request, the inputs and action buttons are locked.
    - When you save or cancel an edit, it goes back to the new textbook input you were writing before the edit.
    - Only a 404 for the textbook being edited ends edit mode.
    - It puts the textbook title in the button `aria-label`.
  - On PC the list and detail are in 2 columns, and on mobile one above the other. Only at the width where they stack in one column (760px or less), picking a textbook moves focus to the detail card. On PC, keyboard focus stays in the list (first-review fix).
- `frontend/src/textbook.ts`: the textbook type, the length limits, the empty form, and the "author · edition" display function. I named it `textbook.ts` so it does not collide with `Textbooks.tsx` on a file system that does not distinguish case, like Windows.
- `frontend/src/api.ts`: moved `requestJson` and `RequestError` from `study-logs.ts` so the two screens share them. Behavior is unchanged.
- `frontend/src/main.tsx`: added "교재" ("Textbooks") to the menu (between study logs and settings). Like study logs, it shows the screen only after the server connection is confirmed.
- `frontend/src/style.css`: the textbook form (2 cells for the title), the list and detail in 2 columns (1 column at 760px or less), and the definition list style for the detail. I reused the existing form and list classes.

## Tests

- `backend/test/ui-harness.ts`: the minimal React stand-in keeps the hook state per component. The state of a component that is not rendered is discarded (the same as unmounting).
  - Before, hook state was kept only by call order. So when you changed screens, the new screen inherited the state cells of the previous screen (the harness limit in the #11 record).
  - Now screen switching can be tested.
- `backend/test/textbooks-ui.test.ts` (a fake API, request records), 15 at first (17 after the first review):
  - The list display (server order, "author · edition", empty values left out) and the first request `GET /api/textbooks`
  - The empty list notice, and the lookup failure notice (the empty list wording is not shown together)
  - The register POST body -> reloading the list -> "등록했습니다" ("Registered"), clearing the form, and showing the new textbook in the detail
  - Showing the server 400 message and keeping the input
  - Detail display (an empty value "—", `aria-current`), and switching to another textbook
  - Edit in the detail -> PUT body -> reflecting in the list and detail -> returning to register mode
  - Restoring the new textbook input being written when an edit is cancelled
  - Delete does not send DELETE until confirmed, cancelling the confirm, and clearing the detail after a delete
  - Deleting the textbook being edited ends the edit
  - Saving an edit of a textbook deleted elsewhere (404) -> the edit ends, and the list and detail are updated
  - Locking the input and buttons during a save request and 1 POST
  - The `aria-label` of the detail buttons
  - If you leave the screen and come back, it starts anew (verifying the harness change, no state mix from study logs -> textbooks)
  - A unit check of `textbookMeta`
- The existing `study-logs-ui.test.ts` and `app-ui.test.ts` pass without changes.

## Verification

| Command                                     | Environment                        | Result                                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                             | Local, `TEST_DATABASE_URL` not set | exit 0. backend tests 53, pass 50, fail 0, **skipped 3** (DB integration), skills 4 pass, build passed                                                                                |
| Playwright (Chromium) screen check 1440×900 | See the browser check below        | The flows of register, server validation error, detail, edit (focus on the title input), and delete confirmation work as expected. 0 page errors                                      |
| Playwright (Chromium) screen check 390×844  | The same environment               | List and detail in 1 column, no horizontal scroll (`scrollWidth` 375 ≤ `innerWidth` 390, the difference is the vertical scrollbar), button height 44px, and focus moves to the detail |

- The 3 skipped are DB integration tests. This change changes only the screen and the test harness and does not change the DB or API. But this PC does not have the `TEST_DATABASE_URL` and `pgpass.conf` written in `docs/next-steps`, and the PostgreSQL service is `postgresql-x64-18`, different from the record, so I could not run it locally. They run in CI (a PostgreSQL 17 service).

### Browser check

- I could not use Docker and the test DB locally, so I attached an in-memory fake pool to the real Express app (`createApp`: validation, routers, and the error handler). I started this app on port 3102 and connected with the Vite dev server (5202, `/api` proxy). I did not put the fake pool script in the repository.
- The Chrome extension was not connected, so I operated with Playwright (Chromium).
- Flows checked (1440×900):
  1. Menu "교재" -> list "미적분학 | 선형대수와 그 응용 Gilbert Strang · 4판" ("Calculus | Linear algebra and its applications Gilbert Strang · 4th edition")
  2. Register "확률과 통계 / 홍길동 / 2판" ("Probability and statistics / Hong Gildong / 2nd edition") -> "등록했습니다", added to the list, and shown in the detail
  3. Register with a title of only spaces -> the server message "제목을 입력하세요"
  4. Detail of "미적분학" (author and edition "—") -> edit (focus on the title input) -> edition 3rd -> "수정했습니다" ("Edited"), reflected in the detail, and back to register mode
  5. Delete -> "삭제 확인" -> "삭제했습니다" ("Deleted"), removed from the list, and the detail cleared
- The console errors were only the `favicon.ico` 404 (existing) and the intended 400 response of step 3.
- Screenshots: [PC 1440×900](assets/21-pc-1440x900.png), [mobile 390×844](assets/21-mobile-390x844.png).

## Automated code review, round 1

A separate read-only review agent reviewed the issue #21 done criteria and the whole PR changes.

- It was confirmed there is no problem with the API contract, the harness change (no effect on existing tests), no CSS regression on the study log screen, and the accuracy of the docs.
- There were no high or medium comments.

- Comment (low): if you pick a textbook, focus moves to the detail card on PC too, so a keyboard user loses their place in the list. The document said "on mobile", which differed from the code.
  - Applied: it moves focus only when `matchMedia('(max-width: 760px)')` matches.
  - I made the harness `mount` take browser globals such as `document` and `matchMedia` as injected.
  - I added tests. On a PC width there is no focus move, and on a mobile width it moves to `textbook-detail`. I confirmed it fails on the code before the fix (fail 1) and passes after the fix.
  - Browser re-check (Playwright, Enter on the title button): at 1440, focus stays on the "미적분학" button, and at 390, it moves to `textbook-detail`.
- Comment (low): when the "삭제" <-> "삭제 확인/취소" buttons swap or a delete finishes, the button that had focus disappears and focus falls to `<body>`.
  - Split: the study log screen has the same structure, so it is a fix across two screens. I split it into [#65](https://github.com/sirloinbh/study-log/issues/65).
- Comment (low): ignoring an earlier list response (effect cleanup) cannot be tested because the harness does not run cleanup functions. It is an existing limit, and I do not claim it was tested.
- Comment (note): there was no delete failure test.
  - Applied: I added a test that if you confirm the delete of a textbook already deleted elsewhere (404), it shows the message, loads the list again, and clears the detail.
- Verification: after the fixes, `npm run check` (`TEST_DATABASE_URL` not set) exit 0. backend tests 55, pass 52, fail 0, skipped 3 (DB integration), skills 4 pass, build passed. The verification table above is based on the first commit before the review fixes.

## Automated code review, round 2

A separate read-only review agent checked the first-round fix (25c2827) and the final whole changes again. The review is limited to 2 rounds, so I do not do a third.

- It was confirmed that the 4 first-round fixes (conditional focus, the delete 404 test, the #65 split, and recording the harness limit) are exact and complete.
- There were no code comments. There is no new issue to split off either.
- Comment (low, docs): the verification table says tests 53 and the first-round section says 55, so the table read like the latest result.
  - Applied: I wrote the `npm run check` result after the fixes in the first-round section and said the table is based on the first commit. I changed only the docs, so I did not re-run the app tests and checked with `npm run format:check`.

## Limits and follow-up

- The table of contents and exercises are not in the detail yet. I attach them to the detail in the table of contents DB and API #13 and the table of contents screen #22.
- When blocking the delete of a textbook with linked study logs (#14) arrives, the server message is shown as it is. I will check any separate screen handling then.
- The local DB environment on this PC differs from "Local environment status" in `docs/next-steps/README.md` (see Verification above). Updating that document is outside this PR's scope.
