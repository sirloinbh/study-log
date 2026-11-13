# #27 Mark and filter important exercises

- Issue: [#27](https://github.com/sirloinbh/study-log/issues/27) (parent #5)
- Branch: `feat/27-important-exercises`
- Prerequisites: #24 exercise DB and API, #25 exercise screen (merged)

## Purpose

Mark the problems you need to look at again, and gather them for the whole textbook or within one chapter.

## Decisions

- The mark is set by value, not a toggle (`{ important: true | false }`). Sending the same request twice gives the same result.
- If you pick a chapter, the problems of that chapter and its sections are gathered together. To see only one chapter, pick that entry (if it has nothing below it, only that entry).
- The list order is the table of contents order (chapter -> its sections -> the next chapter), and within the same entry it is the order they were added.
- The filter list goes on an "important problems" card separate from the exercises card.
  - The exercises card manages the add and edit state based on one chapter. Putting the list for the whole textbook on the same card would shake this basis.
  - If you change on one card, the other card loads again.

## Changes

- `backend/src/exercises.ts`, `backend/src/app.ts`

  | Request                                                          | Behavior                                                                                                                             |
  | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
  | `PATCH /api/exercises/:id/important`                             | Changes only the important flag with `{ important }`. 200 `{ exercise }`                                                             |
  | `GET /api/textbooks/:textbookId/exercises?important=&contentId=` | The textbook's exercises in table of contents order. `contentId` is that chapter and its sections, and `important` is `true`/`false` |
  - A missing exercise: "연습문제를 찾을 수 없습니다" ("Exercise not found") 404. A missing textbook: "교재를 찾을 수 없습니다" 404. A table of contents entry of another textbook: "목차를 찾을 수 없습니다" 404.
  - The order is found by going down the table of contents with a recursive CTE, collecting the sibling `position` into a path array and sorting.
  - Validation messages: "중요 표시 여부를 보내세요" ("Send whether it is marked important"), "중요 표시 형식이 올바르지 않습니다" ("The important mark format is not valid"), "중요 표시 여부를 JSON 객체로 보내세요" ("Send the important mark as a JSON object"), "중요 표시 조건이 올바르지 않습니다" ("The important mark condition is not valid"), and path and table of contents ID errors.
  - There is no new migration. The `important` column is in #24.

- `frontend/src/Exercises.tsx`
  - A "중요 표시/중요 해제" ("Mark important / Unmark") button for each problem. If that problem is being edited, it also changes the important checkbox of the input, so saving the edit does not undo the mark.
  - It exchanges changes with the important problems card through `reloadKey` and `onChanged`.
- `frontend/src/ImportantExercises.tsx` (a new file), `frontend/src/Textbooks.tsx`
  - The "중요 문제" ("Important problems") card: the scope (the whole textbook / each chapter and section), the location (`1 벡터 > 1.2 내적 · 문제 1`, "1 Vectors > 1.2 Inner product · Problem 1"), the body, and the "중요 해제" button.
  - `Textbooks` holds the number of changes of the two cards and passes it to the other card's `reloadKey`.

## Tests

- `backend/test/exercises.test.ts` (no DB)
  - PATCH body validation (missing, string, array) and 404 for a missing problem
  - Textbook list filter validation (textbook ID, table of contents ID, `important` value)
  - 404 for a missing textbook and a table of contents entry of another textbook
- `backend/test/exercises.integration.test.ts` (a real DB)
  - Whether problems added in an order different from the table of contents come out in table of contents order
  - A chapter + its sections scope, a section-only scope, `important=false`, and excluding problems of another textbook
  - Whether marking does not change other columns, and the list after unmarking
  - Whether changing the chapter order (`PUT /contents/order`) also changes the list order
  - The three 404s
- `backend/test/exercises-ui.test.ts` (screen)
  - Marking and unmarking on the exercises card -> PATCH, the badge, the message, and updating the important problems card
  - Whether the important flag is kept in the edit save (PUT) when you mark during an edit
  - The scopes of the whole textbook, chapter, and section on the important problems card, and the request path
  - Unmarking on the important problems card -> the exercises card loads again
  - The failure message of loading important problems
  - I added "중요 표시" to the existing button name list. I changed the fake API to copy rows so data does not mix between tests.

## Verification

| Command                                                    | Environment                                                      | Result                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `npm run check`                                            | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 128, pass 119, fail 0, skipped 9 (DB) |
| `tsx --test --test-concurrency=1 test/*.test.ts` (backend) | Local Docker `postgres:17-alpine`, migrations 001 to 008 applied | tests 128, pass 128, fail 0, skipped 0                      |

- The reason I ran it serially is #76 (a race in `study-logs.integration` in a parallel run, unrelated to this change).
- Browser: I checked by starting the Vite dev server (5202) and this branch's API (3102, the test DB above) with Playwright (Chromium).
  - Mobile 390×844
    - "중요 표시" on the exercises card -> it is added to the important problems card in table of contents order
    - Scope "1 벡터" -> only that chapter and the 1.2 section
    - Unmarking on the important problems card -> the list and the badge on the exercises card are updated
    - No horizontal scroll
  - PC 1440×900: both cards are shown, no horizontal scroll
  - Screenshots: [mobile 390×844 (important problems card, scope 1 Vectors)](assets/27-mobile-390x844.png), [PC 1440×900](assets/27-pc-1440x900.png)

## Automated code review, round 1

A separate read-only review agent reviewed the issue #27 done criteria and the PR changes. There were no high or medium comments. There is nothing to fix, so I do not do a second review.

- Points confirmed to have no problem
  - The recursive CTE: termination, no leak between textbooks, sorting by the path array (chapter -> its sections), no column ambiguity, and parameter types
  - The route mount order and no conflicts
  - No repeated requests in the `tree` and `reloadKey` effect dependencies, and updates between the two cards do not bounce back
  - Syncing the important checkbox of the form being edited, and the busy lock
  - The docs match the code
- low (kept): reloading after a change has no protection for response order. If a load that started just before a change arrives late, it can overwrite a newer list. It receives the same data, so it mostly converges.
  - The existing `refresh` of the exercises card (#25) is the same way. To fix it, the request management of both cards must change together, so I do not do it in this PR.
  - The test harness does not run effect cleanup, so this race cannot be reproduced with a screen test.

## Limits and follow-up

- The important problems card has no show answer or copy question. You do those on the exercises card.
- The important problems card is per textbook. There is no merged list of several textbooks.
