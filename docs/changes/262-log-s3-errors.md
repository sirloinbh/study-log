# Log the original S3 error behind "File storage error" (#262)

## Purpose

`explain` mapped every unknown SDK failure to `502 'File storage error'` and logged nothing, so throttling, network, and KMS errors left no trace.

## Changes

| File                                  | Change                                                                                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/file-storage.ts`         | One JSON line (`file_storage_failed`) with error name, message, `$metadata.requestId` and HTTP status, written before the error is mapped. Already-mapped errors are not logged again. |
| `backend/test/exercise-files.test.ts` | A fake failing client produces exactly one line with the error name and request ID, and no key or bucket.                                                                              |

The bucket, object key, and credentials are never put in the line.

## Verification

See the PR.
