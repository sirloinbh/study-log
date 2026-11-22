# Remove stored files that no row points at and log failed cleanups (#335)

## Purpose

Since #265 a file S3 will not remove after a delete is only logged as `orphaned_files`, and nothing retried it. An upload whose insert was refused removed its copy with a silent `.catch`, and `DELETE /api/exercise-files/:fileId` removed the copy before the row, so a failed row delete left a row pointing at a missing file.

## Changes

| File                                                          | Change                                                                                                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/file-storage.ts`                                 | Optional `FileStorage.list(prefix)` (S3 `ListObjectsV2`, all pages)                                                                                               |
| `backend/src/file-sweep.ts` (new)                             | `sweepOrphanedFiles`: lists `exercises/`, keeps keys with no `exercise_files` row that are older than a 1 hour grace period, removes them only with `apply`       |
| `backend/src/file-sweep-cli.ts` (new), `backend/package.json` | `npm run files:sweep -w backend` (dry run) and `-- --apply`; one JSON line with the counts and keys                                                               |
| `backend/src/exercise-files.ts`                               | The two upload cleanups go through `removeStoredFiles` (logged as `orphaned_files`); the single-file delete deletes the row first, commits, then removes the copy |
| `backend/test/file-sweep.test.ts` (new)                       | Only old unreferenced files are removed, a dry run removes nothing, a failed removal is not reported as removed, a failed cleanup is logged                       |
| `backend/test/exercise-files.integration.test.ts`             | A failing `remove` on the single-file delete answers 204, leaves no row, and logs the key (CI only)                                                               |

## Choices and what is left for the user

- The sweep is a manual command and a dry run by default. It deletes real objects when pointed at the real bucket, so I did not run it and it is not scheduled.
- Listing needs `s3:ListBucket` on the app role; that is an IAM change in `sirloinbh/shared-aws-infrastructure`. Without it the command fails with a storage error, and the keys in the `orphaned_files` log lines are the fallback.
- A single-file delete now answers 204 even if S3 refuses (it answered 502 and kept the row). Same trade as #265.

## Verification

See the PR.
