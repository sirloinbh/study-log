# #14 Link a textbook and chapter to a study log

- Issue: [#14](https://github.com/sirloinbh/study-log/issues/14) (parent #9)
- Branch: `feat/14-study-log-textbook`
- Prerequisites: #10 study log DB and API, #13 textbook table of contents DB and API (both merged)

## Purpose

Leave in the study log which chapter and section of which textbook you studied. It is used as the basis for per-textbook progress and reviews.

## Decisions

I recorded them in an issue comment: [#14 decisions](https://github.com/sirloinbh/study-log/issues/14#issuecomment-6334667747).

- Block deleting a textbook that has study logs linked (the existing decision of #12).
- Also block deleting a table of contents entry that has study logs linked. Even if a record is linked to a lower section, deleting the parent chapter is blocked.
  - The alternative, "only clear the record's table of contents link", was not adopted because the chapter information of past records would be lost.
- The refusal response is 409 and a Korean message.

## Changes

- `database/migrations/005_study_log_textbooks.sql`
  - Added `textbook_id` and `content_id` (both optional) to `study_logs`.
  - The textbook FK is `ON DELETE RESTRICT`.
  - The table of contents FK is the composite FK `(textbook_id, content_id) -> textbook_contents (textbook_id, id)`, `RESTRICT`. The DB rejects a table of contents of another textbook.
  - A CHECK blocks a record that has a table of contents entry but no textbook.
  - I added 2 partial indexes for the textbook filter and the RESTRICT check.
  - The constraints are added after checking `pg_constraint`, so it is safe to re-run.
- `backend/src/study-logs.ts`
  - Added `textbookId` and `contentId` (a positive integer or null, default null) to the input. If you send only a table of contents entry without a textbook, "목차를 고르려면 교재를 먼저 선택하세요" ("Select a textbook first to pick a table of contents entry").
  - A missing textbook answers 400 "교재를 찾을 수 없습니다" ("Textbook not found"), and a missing table of contents entry or one of another textbook answers 400 "목차를 찾을 수 없습니다" ("Table of contents entry not found"). An FK violation (23503) is told apart by the constraint name.
  - Added `textbookId`, `textbookTitle`, `contentId`, `contentNumber`, and `contentTitle` to the response. If there is no link, all are null. The save response also gives the same names with a CTE.
  - `GET /api/study-logs?textbookId=N`: the per-textbook filter. It can be used with `date`.
- `backend/src/textbooks.ts`, `backend/src/textbook-contents.ts`: if there are linked study logs, the delete is refused with 409.
  - Textbook: "학습 기록이 연결된 교재는 삭제할 수 없습니다" ("A textbook with linked study logs cannot be deleted")
  - Table of contents: "학습 기록이 연결된 목차는 삭제할 수 없습니다" ("A table of contents entry with linked study logs cannot be deleted")
  - The table of contents delete rolls back the transaction, so the order pull-up does not happen either.
- Screen (`frontend/src/StudyLogs.tsx`, `study-logs.ts`, `textbook.ts`, `style.css`)
  - Added the textbook -> chapter/section select to the input form.
  - The chapter/section loads the chosen textbook's table of contents and shows it indented in hierarchy order.
  - Before you pick a textbook, you cannot pick a chapter/section. If you change the textbook, the chapter/section selection is cleared. So that the table of contents of the previous textbook is never visible even briefly, the loaded table of contents is kept together with its textbook ID.
  - When editing, the record's textbook and chapter/section are filled in. When a new record is saved, the link is cleared.
  - The recent records show "교재 · 1.2 내적" ("Textbook · 1.2 Inner product").
  - I did not build a textbook filter screen because it is not in the issue's scope (the filter API).

## Tests

- `backend/test/study-log-textbooks.test.ts` (no DB)
  - Validation of the link input (a table of contents entry without a textbook, a string, 0, or a decimal ID) and of the filter query
  - Answering an FK violation with a Korean 400 per constraint
  - 409 for deleting a linked textbook or table of contents entry
- `backend/test/study-log-textbooks.integration.test.ts` (a real DB)
  - Saving a link and the name response
  - Rejecting a missing textbook or a table of contents entry of another textbook
  - The textbook filter (alone, with a date, and a textbook with no records gives an empty list)
  - Editing with a missing textbook or a table of contents entry of another textbook is 400 and the record does not change (first-review fix)
  - 409 and no change for deleting a linked textbook, section, and parent chapter
  - Delete succeeds after changing the link
  - Checking the DB CHECK (23514)
- `backend/test/study-logs-ui.test.ts`
  - The fake API answers the textbooks and table of contents.
  - I reflected the new fields in the existing request body comparison, and the lock cells went from 5 to 7.
  - 4 new tests: saving and showing a link, resetting the chapter/section when the textbook changes, editing a linked record, and the display function
- `backend/test/study-logs.integration.test.ts`: added the null link fields to the response comparison.
- `backend/test/app-ui.test.ts`, `textbooks-ui.test.ts`: matched the request that the study log screen loads textbooks when it starts. The textbook screen test counts only the textbook screen's requests.

## Verification

| Command             | Environment                                            | Result                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`     | Local, `TEST_DATABASE_URL` not set                     | exit 0. backend tests 67, pass 62, fail 0, **skipped 5** (DB integration), skills 4 pass, build passed                                                                                                                                                                                                                      |
| Playwright 1440×900 | A real Express app + an in-memory fake pool, Vite 5202 | The chapter/section disabled before picking a textbook, the chapter/section indented in hierarchy, after saving the list "선형대수와 그 응용 · 1.2 길이와 내적" ("Linear algebra and its applications · 1.2 Length and inner product"), the form link reset, and the list replaced when the textbook changes. 0 page errors |
| Playwright 390×844  | The same environment                                   | Textbook and chapter/section on one line each (294px), no horizontal scroll (`scrollWidth` 375, the difference is the vertical scrollbar)                                                                                                                                                                                   |

- The 5 skipped are DB integration tests. This PC has no test DB connection info. They run in CI (PostgreSQL 17), including the new integration tests.
- The fake pool in the browser check does not run SQL, so it cannot verify the FK and filter SQL. The DB integration tests cover that part.
- Screenshots: [PC 1440×900](assets/14-pc-1440x900.png), [mobile 390×844](assets/14-mobile-390x844.png).

## Automated code review, round 1

A separate read-only review agent reviewed the issue #14 done criteria and the PR changes.

- Confirmed points (no problem):
  - The migration being safe to re-run
  - The division of roles between the composite FK (MATCH SIMPLE) and the CHECK
  - The textbook -> table of contents CASCADE being blocked by the study log RESTRICT (including the parent chapter when a lower section is linked)
  - The possibility of using the partial indexes
  - The range of the 23503 mapping
  - The CTE save response
  - The list query parameter numbers
  - Screen state (preventing mix-up of table of contents lists, edit and cancel, lock during a request)
  - The accuracy of the docs
- There were no high or medium comments. There was no issue to split off.
- Comment (low): there were no integration tests for sending a missing textbook or a table of contents entry of another textbook with PUT, or for the filter on a textbook with no records.
  - Applied: I added both cases to the integration tests. It also checks that a rejected edit does not change the record.
- Comment (low): PUT takes an omitted `textbookId` and `contentId` as null and clears the link. It is intended because the existing PUT is a full replacement, but it was not written in the docs.
  - Applied: I wrote it in the limits below.
- Comment (low): I recorded the two following as limits because they are rare cases.
  - If the textbook and table of contents lists cannot be loaded, the select box looks like "not selected" but the existing IDs remain in the form. When you save an edit, the link is kept as it is.
  - Even if you get a 400 because the table of contents was deleted in another tab, the chapter/section list is updated when you change the textbook or reopen the screen.

## Automated code review, round 2

A separate read-only review agent checked the first-round fix (cc53b52) and the final files again. The review is limited to 2 rounds, so I do not do a third.

- It was confirmed that the assertions of the added integration tests and the order of later steps match the code.
  - After a rejected edit, the record stays linked to `section`.
  - The order delete blocked -> change the link -> delete succeeds is right.
  - The CHECK (23514) check is right too.
- There were no code comments and no issue to split off.
- Comment (docs): the test list was missing the filter on a textbook with no records and the rejected edit.
  - Applied: I added them to the test list as the first-round fix content.

## Limits and follow-up

- `PUT /api/study-logs/:id` is a full replacement. If you omit `textbookId` and `contentId`, the link is cleared. The screen always sends both values.
- The screen update when the textbook and table of contents lists could not be loaded and when the table of contents was deleted elsewhere is as in the first review record above.

- When a delete is refused with 409 on the textbook screen (#21), the server message is shown with the existing error display. There is no separate notice.
- The display for deleting a linked table of contents entry on the table of contents screen is handled in the table of contents screen (#22).
