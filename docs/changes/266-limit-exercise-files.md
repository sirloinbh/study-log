# Limit memory and storage used by exercise files (#266)

## Purpose

Uploads are held in memory and downloads read a whole file into a `Buffer`, with no cap on parallel transfers, so a few dozen 20 MiB transfers could exhaust the container. An exercise could also hold any number of files, and inline PDFs were served from the app origin with no sandbox.

## Changes

| File                                              | Change                                                                                                                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/file-storage.ts`                     | `FileStorage.get` returns a `Readable`; the S3 body is passed on and never copied into a `Buffer`                                                                                                     |
| `backend/src/exercise-files.ts`                   | Download is piped from S3 to the response with `Content-Length` and `Content-Security-Policy: sandbox`; a mid-stream failure is logged (`file_stream_failed`) and the connection is cut               |
| `backend/src/exercise-files.ts`                   | Upload gate: at most 4 uploads in flight (`maxConcurrentUploads`); the 5th gets `503` with `Retry-After`. It is checked before the body is read                                                       |
| `backend/src/exercise-files.ts`                   | Per-exercise limits: 20 files (`409`) and 100 MB in total (`413`). Checked early to skip the body, then again under the exercise row lock before the insert; a refused insert removes the stored copy |
| `backend/test/exercise-files.test.ts`             | Tests for both limits, 4 concurrent uploads plus one 503, the sandbox header and streamed body                                                                                                        |
| `backend/test/exercise-files.integration.test.ts` | The in-memory storage returns a stream                                                                                                                                                                |

## Choices

- The limits (4 uploads at once, 20 files, 100 MB per exercise) are my defaults. They are constants at the top of the limits block in `exercise-files.ts`.
- Uploads still use `multer.memoryStorage()` (each is at most 20 MiB); the gate bounds the total to about 80 MiB. Streaming uploads straight to S3 would need to know the file type first and is not part of this card.
- `docs/openapi.json` is unchanged: no route, parameter, or body shape changed.

## Verification

See the PR.
