# Keep stored files and rows consistent when deleting textbooks (#265)

## Purpose

The delete routes for a textbook, a chapter, and an exercise promised "if S3 cannot remove the files, nothing is deleted". They removed files inside the database transaction in batches and stopped at the first failure, so earlier files were already gone while the rows rolled back. A failed `COMMIT` after the S3 calls had the same result. Rows could then point at files that no longer existed.

## Changes

| File                                                               | Change                                                                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backend/src/exercise-files.ts`                                    | `removeStored` is replaced by `removeStoredFiles`: it runs after the commit, tries every key, never throws, and logs failed keys as one `orphaned_files` JSON line |
| `backend/src/textbooks.ts`, `textbook-contents.ts`, `exercises.ts` | The three delete routes read the keys and delete the rows, commit, then remove the files. The comments now describe this guarantee                                 |
| `backend/test/exercise-files.test.ts`                              | A storage fake that fails the second batch: the failed keys are returned and logged, the other batches are removed, nothing throws                                 |
| `backend/test/exercise-files.integration.test.ts`                  | A failing `remove` no longer blocks a delete: it answers 204, no row remains, and the leftover key is logged (runs only with `TEST_DATABASE_URL`)                  |

## Behavior change

A delete no longer answers 502/503 when S3 cannot remove a file. The rows are gone and the answer is 204. The cost is a possible orphaned S3 object, not a dangling row. The keys are in the log (`orphaned_files`), and a sweep can remove them. I chose logging over a new table so this needs no migration. A sweep job is not part of this card.

## Verification

See the PR.
