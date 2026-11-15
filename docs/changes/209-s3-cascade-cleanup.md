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
  - `TEST_DATABASE_URL=postgres://study_test@localhost:15402/study_test npm run check`: exit 0, backend 434 passed, 0 skipped (435 after the round 1 fix).

## Limits and follow-up

- Not checked against a real S3 bucket (none configured yet).

## Automated review, round 1

A separate review agent read the whole diff. It found nothing blocking; it confirmed the subtree query, that these three deletes are the only cascade paths to `exercise_files`, the rollback on 404, 409, and storage failures, and that the stub changes do not weaken assertions. Applied in the commit "fix: lock the exercises before reading the keys of a delete (#209)":

- **Race:** an upload that committed its row after the keys were read, but before the delete, was cascaded away with its S3 copy left behind. `storedKeys` now locks the exercises in scope (`FOR UPDATE`) and then reads their file keys. A concurrent upload waits, then fails as a missing exercise (and removes its own copy, as in #28).
  - New test: `reading the keys for a delete holds back uploads to those exercises (#209)`. While each kind of key read holds the lock, an `exercise_files` insert for that exercise times out on `lock_timeout` (55P03).
  - Removing `FOR UPDATE` makes this test fail.
- **Bounded removal:** S3 removals run at most 10 at a time instead of all at once.
- **Stub:** the `foreignKeyPool` stub in `study-log-textbooks.test.ts` answers every exercise query with no rows, since the lock query comes first.

Not applied:

- Locks are held during the S3 calls; for one user this only makes other changes to those rows wait. This is noted in a code comment.
- `removeStored` reports only the first failure.
- No test for a non-storage error during removal (it rethrows, and `inTransaction` rolls back and answers 500, as for any query error).
