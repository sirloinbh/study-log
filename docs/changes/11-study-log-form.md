# #11 Study log input form and recent records list screen

- Issue: [#11](https://github.com/sirloinbh/study-log/issues/11) (parent #9)
- Branch: `feat/11-study-log-form`
- Prerequisite: #10 study log DB and API (PR #55 merged)

## Purpose

Build the first screen where you enter a day's study right away and check recent records.

## Changes

- `frontend/src/StudyLogs.tsx`: the study log screen.
  - Input form: the study date (the default is the server's today), start and end, status, and note.
  - When you enter the start and end, it shows the study time in advance. If it crosses midnight, it adds "(다음 날 종료)" ("ends the next day").
  - Save is POST and edit is PUT. After save and edit, it loads the list again from the server.
  - After saving a new record, it clears the form keeping the study date. When you save or cancel an edit, it goes back to the new record input you were using before the edit (or an empty form with today's date if none).
  - It shows the server's Korean validation messages with `role="alert"` and keeps the input values.
  - The 20 recent records: the date, start-end, the study time the server calculated, the status badge, and the note (up to 3 lines). If there are no records, it shows "아직 학습 기록이 없습니다" ("No study records yet").
  - The edit button fills the form with the values and switches to edit mode. You can cancel.
  - Delete runs only after you press "삭제 확인" ("Confirm delete") once more. It does not use the browser `confirm` dialog.
- `frontend/src/study-logs.ts`: the status names, the study time preview (the same midnight crossing rule as the API), the time display (`1시간 30분`, "1 hour 30 minutes"), and the API call helper (passing Korean errors, the connection failure message).
- `frontend/src/main.tsx`: I changed the first menu from the "대시보드" ("Dashboard"), which had no function, to "학습 기록" ("Study logs"). The statistics dashboard is added in #48. It shows the form only after the server connection is confirmed.
- `frontend/src/style.css`: the form grid (4 columns on PC, 2 columns at 760px or less), and the styles for the list, badges, and secondary buttons.

## Tests

- `backend/test/ui-harness.ts`: I moved the minimal React stand-in that was in `app-ui.test.ts` into a shared module.
  - It loads submodules (`.ts`, `.tsx`) in the same VM context.
  - It passes the method and body to `fetch`.
  - It supports input (`fill`), submit (`submit`), value lookup (`field`), and scoped clicks.
  - It prevents an infinite recursion that searched again from the tree root because of a default parameter when a child was `undefined`.
- `backend/test/app-ui.test.ts`: it uses the shared harness. It checks that the first screen title is "학습 기록" and that the form is hidden when the server connection fails.
- `backend/test/study-logs-ui.test.ts` (a fake API, request records):
  - Showing the date, time range, study time, status, and note in the recent records, and the first request is `GET /api/study-logs?limit=20`
  - The empty list notice
  - Input -> the study time preview (crossing midnight) -> the save POST body -> reloading and reflecting the list, and resetting the form (the study date kept)
  - Showing the server 400 message and keeping the input
  - Edit -> filling the form -> the PUT body -> reflecting in the list
  - Delete does not send DELETE until the confirm click
  - Unit checks of the study time preview and the time display

## Verification

| Command                                     | Environment                        | Result                                                                                                                    |
| ------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                             | Local, `TEST_DATABASE_URL` not set | exit 0. backend tests 28, pass 25, fail 0, skipped 3 (DB integration), skills 4 pass, build passed                        |
| headless Chrome (CDP) screen check 1440×900 | See the browser check below        | The flows of input, save, validation error, edit, and delete confirmation all work as expected. 0 page errors             |
| headless Chrome (CDP) screen check 390×844  | The same environment               | The form in 2 columns, no horizontal scroll (`scrollWidth` 390 = `innerWidth` 390), and the list wraps normally. 0 errors |

### Browser check

- There was no PostgreSQL or Docker locally, so I could not run with a real DB. Instead I attached an in-memory fake pool to the real Express app (`createApp`: validation, routers, and the error handler), started it on port 3012, and connected with the Vite dev server (5172, `/api` proxy).
- The Chrome extension was not connected, so I ran the local Chrome headless and operated it with the DevTools protocol. I put values in with the native setter and the `input` event that React detects.
- Flows checked (1440×900):
  1. Enter 23:20 to 00:50 -> "학습 시간 1시간 30분 (다음 날 종료)" ("Study time 1 hour 30 minutes (ends the next day)")
  2. Save -> "저장했습니다" ("Saved"), added at the top of the list
  3. Save with the same start and end -> the server message "종료 시각은 시작 시각과 달라야 합니다" ("The end time must differ from the start time")
  4. Edit -> end 01:20 -> "수정했습니다" ("Edited"), and 2 hours is reflected in the list
  5. Delete -> "삭제 확인" -> "삭제했습니다" ("Deleted"), removed from the list
- Screenshots: [PC 1440×900](assets/11-pc-1440x900.png), [mobile 390×844](assets/11-mobile-390x844.png).
- The PC screenshot captured the whole page beyond the viewport, so the fixed sidebar background looks like it ends at 900px. On the real screen, the sidebar is fixed to the viewport height.

## Automated code review, round 1

A separate read-only review agent reviewed the issue #11 done criteria and the whole PR diff. The API contract (5 fields, `?limit=20`, delete 204) was right. I applied all the comments in this PR, and no issue was split off.

- Comment (medium): if you edited or cancelled a record with a past date, the new record form stayed at that date.
  - Applied: when entering an edit, it keeps the new record input values, and after saving or cancelling the edit it goes back to that value (today if none).
- Comment (medium): if the list lookup failed, "아직 학습 기록이 없습니다" appeared together, and if the reload after saving failed, the list that was showing disappeared.
  - Applied: a lookup failure is shown only as "최근 기록을 불러오지 못했습니다: …" ("Could not load the recent records: …"), and the list that was already showing is kept.
- Comment (low): other actions were possible during a request. If you pressed "삭제 확인" twice quickly, DELETE went twice and a 404 error showed, and an edit or cancel during a save was overwritten by the save completion handling.
  - Applied: during a save and delete request, all action buttons are disabled (locking the input fields was added in round 2).
- Comment (low): even if PUT or DELETE was 404 (already deleted), the screen was not updated.
  - Applied: when a write fails, it loads the list again. If it is a 404 during an edit, it ends edit mode. `RequestError` holds the HTTP status.
- Comment (low): an earlier list response that arrived late could overwrite the new response.
  - Applied: it ignores the result of the earlier request with an effect cleanup function.
- Comment (low): notices kept staying, and the notice area appeared together with the text, so a screen reader might not read it.
  - Applied: it clears the notice when you change the input. The `role="status"` area is always present.
- Comment (low): the row button names were all "수정" and "삭제". On edit it did not move to the form, and the mobile button height was about 32px.
  - Applied: I put the date and time range in `aria-label`. On edit it moves focus to the study date input. The buttons are at least 36px on PC and 44px on mobile.
- Comment (low): there were no tests for cancel, deleting a record while editing, cancelling the delete confirmation, a lookup failure, and a network error.
  - Applied: I added 8 tests to `study-logs-ui.test.ts`. The harness rejects clicks on a disabled button. It does not wait for the click handling to complete, so it can also check the during-request state.
  - I confirmed that the 8 new tests fail on the `StudyLogs.tsx` before the fix and pass after the fix.
- Harness limit (review note): the minimal React stand-in keeps hook state by call order. So when you switch screens (settings -> study logs), the state is not reset like in a real React. State checks on screen switching are not done with this harness.

### Verification after the first-round fix

| Command                                                          | Environment                                       | Result                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` (`TEST_DATABASE_URL` set)                        | Local PostgreSQL 17.11, migrations applied twice  | exit 0. backend tests 36, pass 36, fail 0, **skipped 0** (the DB integration actually ran), skills 4 pass                                      |
| headless Chrome (CDP) 1440×900, the real API + a real PostgreSQL | Vite 5172 -> `src/server.ts` 3012 -> the local DB | Input, save, rejecting the same time (server message), edit (focus on the study date input), and delete confirmation are normal. 0 page errors |
| headless Chrome (CDP) 390×844                                    | The same environment                              | The form in 2 columns, no horizontal scroll, and button height 44px. 0 page errors                                                             |

- I installed a local PostgreSQL 17 and made the test-only DB `study_test`. The password is only in `pgpass.conf` and I did not put it in `TEST_DATABASE_URL`.
- After the browser check, I deleted the check rows left in the test DB.
- I retook the screenshots with the real DB.

## Automated code review, round 2

A separate read-only review agent checked the first-round fix (69799ef), the added diff, and the final whole diff again. All 8 first-round fixes were exact. I applied the comments below in this PR, and no issue was split off. Under the policy of at most 2 reviews, I do not do a third.

- Comment (medium): if you deleted an already deleted record B (404) while editing record A, A's edit ended and the input was lost.
  - Applied: it ends edit mode only when the 404 is about the record being edited.
- Comment (low): you could still type in the input fields during a save request, and the input was overwritten when the save finished.
  - Applied: during a request, the input fields are disabled too.
- Comment (low): ignoring an earlier response (effect cleanup) cannot be tested because the harness does not run cleanup functions. I do not claim in the docs that it was tested.
- Tests: I added 2 tests that check the two cases above. I confirmed they fail on the code before the fix and pass after the fix.
- Verification: `npm run check` with `TEST_DATABASE_URL` set exit 0. backend tests 38, pass 38, fail 0, skipped 0. Skills 4 pass, build passed.

## Limits and follow-up

- The screen check of the first commit was done with a fake pool. After the first-review fixes, I checked again with a real PostgreSQL (the table above).
- Connecting the Chrome extension and checking running Docker (Compose) are outside this PR's scope.
- I did not adopt frontend-only test tools (Vitest, Testing Library, Playwright). As before, I verify the screen logic in the backend `node --test` with the minimal React stand-in.
- The textbook and chapter link is handled in #14, the calendar view in #17, and the Markdown note in #16.
