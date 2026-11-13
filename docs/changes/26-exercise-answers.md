# #26 Enter and view exercise answers (manual)

- Issue: [#26](https://github.com/sirloinbh/study-log/issues/26) (parent #5)
- Branch: `feat/26-exercise-answers`
- Prerequisites: #24 exercise DB and API, #25 exercise screen (merged)

## Purpose

Enter and save the answer for each problem by hand, and expand it on the exercise screen to check.

## Decisions

- There is one answer per problem (1:1). The issue did not set a number, so I chose the simplest form. If several solutions are needed, write them together in the body. If several become needed, change the table in a separate issue.
- On the screen, only one problem's answer is expanded at a time. If you open another problem's answer, the earlier one closes.

## Changes

- `database/migrations/008_exercise_answers.sql`: the `exercise_answers` table.
  - `exercise_id` is the primary key. So only one answer is stored per problem.
  - FK `-> exercises (id) ON DELETE CASCADE`: if you delete a problem, its answer is deleted too. Deleting a table of contents entry or a textbook also deletes them through the problem.
  - The body CHECK is the same as the problem body (`body ~ '\S'`, 20000 characters or fewer).
- `backend/src/exercises.ts`

  | Request                            | Behavior                                                                              |
  | ---------------------------------- | ------------------------------------------------------------------------------------- |
  | `GET /api/exercises/:id/answer`    | `{ answer: { exerciseId, body } }`. If there is no answer, `{ answer: null }`         |
  | `PUT /api/exercises/:id/answer`    | Saves with `{ body }`, and replaces it if it exists (`ON CONFLICT`). 200 `{ answer }` |
  | `DELETE /api/exercises/:id/answer` | 204. If there is no answer, "정답을 찾을 수 없습니다" ("Answer not found") 404        |
  - For a missing problem, all three requests answer 404 "연습문제를 찾을 수 없습니다" ("Exercise not found"). PUT is judged by an FK violation (23503).
  - The body is saved with line breaks and indentation as they are, like the problem body.
  - Validation messages: "정답을 입력하세요" ("Enter the answer"), "정답 형식이 올바르지 않습니다" ("The answer format is not valid"), "정답은 20000자 이하로 입력하세요" ("Enter the answer in 20000 characters or fewer"), "정답 내용을 JSON 객체로 보내세요" ("Send the answer content as a JSON object"), and path ID errors.

- `frontend/src/Exercises.tsx`, `frontend/src/exercise.ts`, `frontend/src/style.css`
  - A "정답 보기/닫기" ("Show answer / Close") button for each problem (`aria-expanded`, an `aria-label` that has the problem name).
  - When expanded, it loads and shows the answer. If there is none, it shows "입력한 정답이 없습니다" ("There is no answer entered") and a "정답 입력" ("Enter answer") button.
  - "정답 입력/수정" opens an input field under the problem. When you save, it saves with PUT. If you save it empty, it deletes the stored answer with DELETE.
  - While saving, it uses the same `busy` lock as #25. After saving, it loads the list again. If the problem was deleted elsewhere, it shows the server message and the problem leaves the list.
  - If you change the chapter, the answer panel closes. If you open it again, it loads the answer anew (first-review fix).

## Tests

- `backend/test/exercises.test.ts` (no DB)
  - A wrong answer body or a non-JSON body -> a Korean 400, and path ID validation
  - 404 for a missing problem (GET, DELETE, and an FK violation on PUT), and the DELETE 404 message when only the answer is missing
  - No answer -> `null`, and keeping line breaks on save
- `backend/test/exercises.integration.test.ts` (a real DB)
  - An empty answer, save and lookup, saving again replaces it (1 row), and other problems are not affected
  - Delete and 404 on a second delete, and 404 for a missing problem
  - DB constraints: an answer of only spaces 23514, and a second answer for the same problem 23505
  - When a problem is deleted, the answer is deleted too
- `backend/test/exercises-ui.test.ts` (screen)
  - Entering and saving an answer (the PUT body, showing line breaks), edit and cancel, and DELETE when saved empty
  - Only one is expanded at a time, `aria-expanded`, and hiding and returning when you switch chapters
  - The load failure message, and the case where the problem was deleted while saving
  - Added "정답 보기" to the problem button name list

## Verification

| Command                                                    | Environment                                                            | Result                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `npm run check`                                            | Local, `TEST_DATABASE_URL` not set                                     | exit 0. backend tests 119, pass 111, fail 0, skipped 8 (DB) |
| `tsx --test --test-concurrency=1 test/*.test.ts` (backend) | Local Docker `postgres:17-alpine`, migrations 001 to 008 applied twice | tests 119, pass 119, fail 0, skipped 0                      |
| `npm run test -w backend` (default parallel)               | The same DB as above                                                   | pass 117, **fail 1**: `study-logs.integration` (see below)  |

- The 1 failure in the parallel run is unrelated to this change. It fails the same way on `main` with the same DB.
  - Cause: the `?limit=1` check in `study-logs.integration` looks at the latest record in the whole shared test DB.
  - If another integration test file running in parallel at the same time inserts a record with a later date (2099-02-20, 2099-03-10), the result changes.
  - I split it into [#76](https://github.com/sirloinbh/study-log/issues/76).
- I applied migrations 001 to 008 twice to the same DB and confirmed they are safe to re-run.
- Browser: I checked by starting the Vite dev server (5202) and the API (3102, the test DB above) with Playwright (Chromium).
  - Mobile 390×844
    - Expanding an answer and showing line breaks
    - If you expand another problem, the earlier answer closes
    - Focus on the answer input
    - After entering and saving, "정답을 저장했습니다" ("Saved the answer") is shown, and I confirmed the saved value through the API
    - No horizontal scroll
  - PC 1440×900: the answer panel is shown
  - Screenshots: [mobile 390×844 (typing)](assets/26-mobile-390x844.png), [PC 1440×900](assets/26-pc-1440x900.png). I captured only the exercises card.

## Automated code review, round 1

A separate read-only review agent reviewed the issue #26 done criteria and the changed files. There were no high comments. There is no issue to split off either.

- medium: if you save empty an answer that was already deleted elsewhere, DELETE gets 404 "정답을 찾을 수 없습니다". The input field and the old answer stayed, and saving again repeated the same error.
  - Applied: this 404 on saving empty is handled as deleted. A 404 where the problem itself is missing is still shown as an error.
  - Regression test: `clearing an answer already deleted elsewhere counts as cleared`.
- medium: if you changed the chapter and came back, the answer panel showed the value loaded earlier again. The load effect depended only on the problem ID, so it did not run again. So an answer changed elsewhere was not reflected, and even when saving empty, it judged by the old value.
  - Applied: picking a chapter closes the panel.
  - Regression test: `one answer is open at a time and picking a chapter closes it`.
- I confirmed that the two regression tests fail on the code before the fix and pass after the fix.
- low (kept)
  - Telling the cause of the answer DELETE 404 (no answer / no problem) takes two queries, so there is a race in between. It is for telling the message apart, so there is no effect.
  - If there is no stored answer and you save with an empty value, only the input field closes with no message. Nothing changed, so I leave it.
- When you change the textbook, `Textbooks.tsx` recreates the exercises card with `key={selected.id}`, so the same problem does not occur.

## Automated code review, round 2

A separate read-only review agent checked the first-round fix (7027a21) and the whole final PR again. The review is limited to 2 rounds, so I do not do a third.

- It was confirmed that the two fixes are right and no case is missing.
  - When saving empty, only "정답을 찾을 수 없습니다" is handled as deleted. A problem-missing 404 is still an error.
  - If you open it again after changing the chapter, the load effect runs again.
- There were no code comments and no issue to split off.
- Note
  - Comparing the message string depends on the server wording. For now both sides are the same string.
  - For rare Unicode whitespace (U+0085 and so on), the whitespace decision of the API and DB can differ. It is the same limit as the #24 record.

## Limits and follow-up

- The race in the parallel run of `study-logs.integration` was split into [#76](https://github.com/sirloinbh/study-log/issues/76).
- #58 (a 500 for a NUL character) applies to answers too. It is fixed commonly in #58.
- The list does not show in advance which problems have an answer. You can know only by expanding.
