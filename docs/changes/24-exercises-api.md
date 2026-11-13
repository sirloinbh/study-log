# #24 Exercise DB and API (linked to the table of contents, text input)

- Issue: [#24](https://github.com/sirloinbh/study-log/issues/24) (parent #5)
- Branch: `feat/24-exercises-api`
- Prerequisite: #13 textbook table of contents DB and API (merged)

## Purpose

Store the exercises for each chapter and section of a textbook. It supports text input first, before file input (#28 to #30). It is the base for the exercise screen (#25), answers (#26), and the important problem filter (#27).

## Changes

- `database/migrations/007_exercises.sql`: the `exercises` table.
  - Columns: the textbook, the table of contents entry (chapter or section), the problem number (20 characters, empty allowed), the body (not only spaces, 20000 characters or fewer), and the important flag (default false).
  - Composite FK `(textbook_id, content_id) -> textbook_contents (textbook_id, id)`: it cannot be put on the table of contents of another textbook.
  - `ON DELETE CASCADE`: if you delete a table of contents entry, the exercises of that entry (and its sections) are deleted too. If you delete a textbook, they are deleted through the table of contents (the existing policy in the #12 migration comment).
  - An index for lookup by table of contents `(textbook_id, content_id, id)`.
- `backend/src/exercises.ts`, `backend/src/app.ts`

  | Request                                                        | Behavior                                                                                           |
  | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
  | `GET /api/textbooks/:textbookId/contents/:contentId/exercises` | The exercises of that table of contents entry in the order they were added. `{ exercises: [...] }` |
  | `POST` the same path                                           | Add `{ number?, body, important? }`. 201 `{ exercise }`                                            |
  | `GET /api/exercises/:id`                                       | One problem                                                                                        |
  | `PUT /api/exercises/:id`                                       | Replaces the number, body, and important flag. It does not change the table of contents entry. 200 |
  | `DELETE /api/exercises/:id`                                    | 204                                                                                                |
  - Response fields: `id`, `textbookId`, `contentId`, `number`, `body`, `important`.
  - The body is saved with the line breaks and indentation as entered (not trimmed). The number has leading and trailing spaces removed.
  - A missing table of contents entry or one of another textbook answers 404 "목차를 찾을 수 없습니다" ("Table of contents entry not found"). On add, it is judged by an FK violation (23503).
  - A missing problem answers 404 "연습문제를 찾을 수 없습니다" ("Exercise not found").
  - Validation messages:
    - "문제 본문을 입력하세요" ("Enter the problem body")
    - "문제 본문은 20000자 이하로 입력하세요" ("Enter the problem body in 20000 characters or fewer")
    - "문제 번호 길이는 20자 이하여야 합니다" ("The problem number must be 20 characters or fewer")
    - "중요 표시 형식이 올바르지 않습니다" ("The important mark format is not valid")
    - "연습문제 내용을 JSON 객체로 보내세요" ("Send the exercise content as a JSON object")
    - Path ID errors

- The important flag supports only save and edit. The toggle API and the important problem filter are in the scope of #27.

## Tests

- `backend/test/exercises.test.ts` (no DB)
  - A wrong body, number, important flag, or a non-JSON body -> a Korean 400. Both POST and PUT are checked.
  - Validation of the textbook, table of contents, and exercise path IDs
  - 404 for a missing table of contents entry or problem, and an FK violation on add -> 404
  - Whether keeping body line breaks and the number trim are passed to the query as they are
- `backend/test/exercises.integration.test.ts` (a real DB)
  - An empty list, add (the body saved as it is), the lookup order by table of contents, and 404 for access to a table of contents of another textbook
  - Edit, lookup, and delete
  - When a chapter is deleted, the problems of its sections are deleted too, and when a textbook is deleted, they are deleted too
  - Direct check of DB constraints: a table of contents of another textbook 23503, and a body of only spaces, a body of only line breaks and tabs, and a 21-character number 23514

## Verification

| Command         | Environment                        | Result                                                                                                 |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run check` | Local, `TEST_DATABASE_URL` not set | exit 0. backend tests 91, pass 84, fail 0, **skipped 7** (DB integration), skills 4 pass, build passed |

- The 7 skipped are DB integration tests (no local test DB). They run in CI (PostgreSQL 17), including the new integration tests.
- There was no screen change, so I did not check in a browser. It is not in the issue's done criteria either.

## Automated code review, round 1

A separate read-only review agent reviewed the issue #24 done criteria and the PR changes.

- Points confirmed to have no problem:
  - The composite FK target (the unique key in 004)
  - The cascading delete inside the table of contents delete transaction coexisting with the study log RESTRICT (409)
  - No orphan rows with concurrent adds and deletes
  - The migration being safe to re-run, and the purpose of the index
  - No mount order or path conflicts
  - The 23503 -> 404 mapping on add (this table has only one FK)
  - Zod being stricter than the DB
  - Consistency of the API contract
- There were no high or medium comments. There is no issue to split off either.
- Comment (low): the DB CHECK `length(btrim(body)) >= 1` removes only spaces, so a body of only line breaks and tabs passed the DB. The API (Zod `trim`) rejects it.
  - Applied: I changed the CHECK to `body ~ '\S'` to match the API. I added to the DB integration test that an INSERT of a body of only line breaks and tabs is 23514.
  - 007 was not merged yet, so I fixed the same file.
- Note (kept):
  - The integration test is one big test. It is the same way as the other integration tests.
  - If the table of contents is deleted between the table of contents check and the list query of a list lookup, it becomes an empty 200 instead of 404. It is a harmless race, the same as the table of contents API.

## Automated code review, round 2

A separate read-only review agent checked the first-round fix (c27e259) and the final files again. The review is limited to 2 rounds, so I do not do a third.

- `'\S'` is passed to the regular expression as it is with `standard_conforming_strings` (the PostgreSQL 17 default). It was confirmed that for ASCII whitespace such as spaces, tabs, and line breaks it decides the same as Zod `trim`.
- The shape of the new test case and the source of 23514 (a CHECK, not an FK) are right.
- There were no code comments and no issue to split off.
- Note: for rare Unicode whitespace, the two decisions differ. I recorded it in the limits below.

## Limits and follow-up

- For rare Unicode whitespace, the whitespace decision differs between the API (Zod `trim`) and the DB (`~ '\S'`, which depends on the locale).
  - A body of only NBSP: the API rejects it first with 400. It is the safe direction.
  - A body of only U+0085 (NEL): the API accepts it and the DB CHECK can reject it, giving a 500.
  - It is very unlikely to happen in real textbook input, so I do not fix it in this PR.

- The existing problem that a NUL character in the body gives a 500 (#58) applies to this API too. It is fixed commonly in #58.
- There is no feature to move a problem to another table of contents entry.
- The order within a table of contents entry is the order of adding (ID). If sorting by problem number is needed, I will judge again on the screen (#25).
