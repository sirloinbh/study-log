# #209 Remove S3 objects when an exercise, chapter, or textbook is deleted

- Issue: [#209](https://github.com/sirloinbh/study-log/issues/209) (parent #5)
- Branch: `feat/209-s3-cascade-cleanup`
- Prerequisite: #28 file upload foundation (merged in PR #210)

## Purpose

Since #28, deleting one file removes its S3 object, but deleting an exercise, a chapter, or a textbook only cascaded the `exercise_files` rows. Their S3 objects stayed in the bucket, unreachable from the app.

## Decision

- User decision (2026-11-15): **when S3 cannot remove the files, refuse the delete.** Nothing is deleted from the DB, the storage error is returned, and repeating the request finishes the job. This is the same rule as the single-file delete in #28, and no object is ever left in S3 without its row.
- How it is done: one transaction per delete.
  1. Read the S3 keys of the files the delete takes with it. An exercise has its own files, a chapter has its own and its sections' files, and a textbook has all of its exercises' files.
  2. Run the delete. A 404 or a 409 (a study log or schedule attached) ends here, and no S3 object is touched.
  3. Remove the objects from S3.
  4. Commit only when every removal succeeded. Otherwise roll back and answer with the storage error (for example 502 or 503).
- Limit: if S3 removes some objects and fails on others, the removed ones stay removed. Their rows then answer 404 for the content until the delete is repeated. The same is true if the commit fails after S3 succeeded. No object is left without a row in either case.

## Changes

- `backend/src/exercise-files.ts`: `storedKeys(db, owner)` reads the keys for an exercise, a chapter subtree (recursive), or a textbook. `removeStored(storage, keys)` removes them all and returns the first storage failure as a reply.
- `backend/src/exercises.ts`, `backend/src/textbook-contents.ts`, `backend/src/textbooks.ts`: the delete routes follow the steps above. The exercise and textbook deletes now run in a transaction (`inTransaction`); the chapter delete already did (`writeContents`). The route factories take the `FileStorage`.
- `backend/src/app.ts`: passes the storage to those routes.

## Verification

- `backend/test/exercise-files.integration.test.ts` (new test `deleting an exercise, chapter or textbook removes its stored files, or nothing (#209)`):
  - With S3 removal failing, each of the four deletes answers 502 and leaves every row and object in place.
  - Deleting an exercise removes only its object.
  - Deleting a chapter removes its own and its section's objects, and not another chapter's.
  - A textbook with a study log answers 409 and keeps its objects.
  - Without the log, deleting the textbook removes the last object and row.
- Updated pool stubs, with unchanged assertions:
  - `textbooks.test.ts` and `exercises.test.ts`: `emptyPool` gets `connect()` for the transaction.
  - `study-log-textbooks.test.ts`: `foreignKeyPool` answers the file key lookup with no rows.
- Commands (2026-11-15, Docker `db` container):
  - `TEST_DATABASE_URL=postgres://study_test@localhost:15402/study_test npm run check`: exit 0, backend 434 passed, 0 skipped.

## Limits and follow-up

- Not checked against a real S3 bucket (none configured yet).
