# #13 Textbook table of contents (chapter and section hierarchy) DB and API

- Issue: [#13](https://github.com/sirloinbh/study-log/issues/13) (parent #5)
- Branch: `feat/13-textbook-contents`
- Prerequisite: #12 textbook basic info DB and API (merged)

## Purpose

Store the chapter and section structure of a textbook so that study logs (#14), schedules, and exercises can refer to table of contents entries.

## Changes

- `database/migrations/004_textbook_contents.sql`: the `textbook_contents` table.
  - Columns: the textbook, the parent entry (`parent_id`, a top-level chapter if none), the order among siblings (`position`, from 0), the number (20 characters, empty allowed), and the title (1 to 200 characters).
  - Only an entry of the same textbook can be the parent. The DB blocks it with the composite FK `(textbook_id, parent_id) -> (textbook_id, id)`.
  - The order among siblings does not overlap. It is `UNIQUE NULLS NOT DISTINCT (textbook_id, parent_id, position)`. Top-level chapters (`parent_id` NULL) do not overlap each other either.
    - This constraint is `DEFERRABLE INITIALLY IMMEDIATE`, so it is checked at the end of the statement. So one UPDATE can pull up or swap the order.
  - If you delete a textbook or a parent entry, the entries under it are deleted too (CASCADE).
  - The hierarchy depth is not limited (chapter, section, subsection).
  - A parent entry must exist first and there is no API to change the parent, so no cycle can form.
- `backend/src/textbook-contents.ts`, `backend/src/app.ts`: the `/api/textbooks/:textbookId/contents` API.

  | Request       | Behavior                                                                                                                                                   |
  | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `GET /`       | The table of contents tree `{ contents: [{ id, parentId, number, title, children: [...] }] }`. Siblings in order                                           |
  | `POST /`      | `{ parentId?, number?, title }`. Adds at the end of the same parent entry. 201 `{ content }`. A parent entry of another textbook gives 400                 |
  | `PUT /:id`    | Edit `{ number?, title }`. 200 `{ content }`                                                                                                               |
  | `DELETE /:id` | Deletes it with the entries under it and pulls up the order of the remaining siblings. 204                                                                 |
  | `PUT /order`  | `{ parentId?, ids }`. Saves all items of the same parent entry in the order sent, once each. 400 if you send only some or mix in other items. 200 the tree |
  - Writes (add, delete, reorder) lock the textbook row with `FOR UPDATE` inside a transaction. Concurrent requests for the same textbook do not write the order values out of step. On a 4xx response, it rolls back.
  - A missing textbook answers 404 "교재를 찾을 수 없습니다" ("Textbook not found"), and a missing entry (including an entry of another textbook) answers 404 "목차를 찾을 수 없습니다" ("Table of contents entry not found").
  - The path ID and body ID are validated with the same rule as the textbook API (a positive integer of 15 digits or fewer). The validation messages are in Korean.

## Tests

- `backend/test/textbook-contents.test.ts` (no DB):
  - Checks that 14 kinds of wrong bodies are rejected with a Korean 400 before reaching the DB (title, number, parent entry ID, not a JSON object, an empty order list, duplicates, negatives).
  - Checks the validation of the textbook and entry IDs in the path.
  - A missing textbook is 404, and all 3 write transactions roll back and return the connection.
- `backend/test/textbook-contents.integration.test.ts` (a real DB, needs `TEST_DATABASE_URL`):
  - Lookup of the chapter, section, and subsection tree, and trimming spaces from titles
  - 4 concurrent adds to the same chapter -> orders 0 to 3 do not overlap
  - Reordering (reverse), rejecting a missing item or an item from another chapter mixed in, and reordering top-level chapters
  - Edit
  - Blocking access to a parent entry and entry IDs of another textbook
  - On delete, the entries under it are deleted too, the order of the remaining siblings is pulled up, and the order of other chapters is kept
  - Direct check of DB constraints: an INSERT with a parent entry of another textbook is 23503, and an INSERT with an overlapping order is 23505
  - Deleting a textbook deletes its table of contents

## Verification

| Command             | Environment | Result                      |
| ------------------- | ----------- | --------------------------- |
| `npm run format`    | Local       | Applied                     |
| `npm run lint`      | Local       | exit 0                      |
| `npm run typecheck` | Local       | exit 0                      |
| `npm test`          | n/a         | **Not run locally** (below) |

- Following the user's request ("go straight to the next issue card without tests"), I did not run the tests locally. I wrote the test code, and it runs in CI (a PostgreSQL 17 service, all migrations applied). The result is checked in the PR checks.
- This PC has no test DB connection info, so I cannot run the migrations and the DB integration tests locally (see the #21 record).

### CI result

- In GitHub Actions `verify` for the first commit (110063e) of PR #66, `npm run check` passed.
  - Environment: a PostgreSQL 17 service, migrations 001 to 004 applied
  - backend tests 59, pass 59, fail 0, **skipped 0**
  - The table of contents DB integration tests ran on a real DB and passed. Skills 4 pass, and `docker-build` passed.
- This CI is the first time the new migration 004 was applied to a real PostgreSQL. I did not do a local apply or a re-run check.

## Automated code review, round 1

A separate read-only review agent reviewed the issue #13 done criteria and the PR changes (the migration, the router, the app connection, and the docs).

- It was confirmed there is no problem with the composite FK, the unique constraint checked at the end of the statement, pulling up the order after a delete, the UPDATE that reorders, adding at the end, the lock order (textbook row -> entry rows), transactions and returning connections, the migration being safe to re-run, and the route order (`/order` -> `/:id`).
- There were no high or medium comments. There is nothing to fix in this PR, so by the policy I go to the CI check and the merge without a second review.
- I handled the low comments as follows.
  - Even if `ROLLBACK` fails, the connection is returned to the pool as it is. It needs a check of the whole backend, so I split it into [#68](https://github.com/sirloinbh/study-log/issues/68).
  - The ID validation allows up to 15 digits, but the response converts with `id::int`. A 500 occurs for an ID over 2.1 billion, and the textbook and study log APIs are the same. I split it into [#67](https://github.com/sirloinbh/study-log/issues/67).
  - The `parent_id` index alone may be unnecessary because it overlaps with other indexes. It does no harm, so I keep it.
  - The textbook existence check in the lookup and the tree lookup are separate queries, so if the textbook is deleted in between, an empty tree 200 is answered. It has no effect, so I keep it.

## Limits and follow-up

- Changing the parent entry (moving to another chapter) is out of scope. If needed, handle it in a separate issue, including a cycle check.
- The table of contents screen is in #22 (manual input and editing), and parsing table of contents text is in #23.
- When study logs and exercises refer to the table of contents (#14, #24), the delete policy for referenced entries is decided then.
