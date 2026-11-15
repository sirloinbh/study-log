# #28 PDF and image file upload foundation

- Issue: [#28](https://github.com/sirloinbh/study-log/issues/28) (parent #5)
- Branch: `feat/28-file-upload`
- Prerequisites: #24 exercise DB and API (merged)

## Purpose

Keep the original files (PDFs, photos) of exercises and answers, so #29 and #30 can later read questions and answers out of them.

## Decisions

- User decisions ([2026-10-23 comments](https://github.com/sirloinbh/study-log/issues/28)), reconfirmed on 2026-11-15
  - Storage: **S3**. Bucket, region and credentials come only from `.env` or the server's IAM role and are never committed. Without them, file requests are refused with a setup message.
  - Packages: `@aws-sdk/client-s3` and an upload library (`multer`), pinned exactly and installed with `--ignore-scripts`.
  - Tests use an S3 stand-in.
- Rules I set
  - Formats: PDF, JPEG, PNG. The type is read from the file's first bytes, not from its name or the type the browser sent.
  - Size: at most **20 MiB** per file (the issue did not set a number). One file per request.
  - Each file is linked to one exercise with a role, `problem` or `answer`, and goes with the exercise when that is deleted.
  - The S3 key is `exercises/<exercise id>/<random UUID>.<ext>`. The original name is kept only for showing and downloading.
  - Uploads need the header `X-Requested-With: study-log`. A multipart form from another site needs no CORS preflight, but it cannot add this header.

## Checks before installing (the 14-day supply chain rule)

- `multer` **2.5.0** (2026-10-22). I first suggested 2.4.0, but `npm audit` reported a high advisory for 2.0.0 to 2.4.0 ([GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m), DoS through an async `fileFilter`, which this code does not use). 2.5.0 fixes it, and `npm audit` now finds 0 vulnerabilities.
- `@aws-sdk/client-s3` **3.1161.0** (2026-10-30, published by the AWS SDK maintainers). Its dependencies use `^` ranges, and the first install resolved 17 of them to versions 4 to 11 days old. I reinstalled it with `--before=2026-11-01`, so every dependency resolves to a version published before that day.
- `@types/multer` 2.3.0 (2026-09-28), dev only.
- 34 new packages in all. None has an install script, and all resolve from `registry.npmjs.org`. The newest is from 2026-10-30.
- `backend/package-lock.json` (used by the Docker build) was rewritten from the root lockfile with `npm run lockfiles:sync`.

## Changes

- `database/migrations/020_exercise_files.sql` (new): `exercise_files` (exercise, role, S3 key, original name, type, size, time). **Apply it to existing DBs** with `npm run db:migrate -w backend`.
- `backend/src/file-storage.ts` (new): the `FileStorage` type and `s3Storage()`. The client is made on first use, so the server starts without settings. SDK errors become 404 (object missing), 503 (settings, credentials, bucket) or 502.
- `backend/src/exercise-files.ts` (new)
  - `GET /api/exercises/:id/files`: `{ files: [{ id, exerciseId, role, name, contentType, size, createdAt }] }`
  - `POST /api/exercises/:id/files`: multipart `file` and `role`. 201 `{ file }`. Refusals: 403 (no app header), 415 (not multipart, or not PDF/JPEG/PNG), 413 (over 20 MB), 400 (role, empty file, more than one file, name over 255 characters, broken multipart), 404 (no exercise). It stores in S3 first; if the row cannot be saved, it removes the S3 object again.
  - `GET /api/exercise-files/:fileId`, `GET /api/exercise-files/:fileId/content` (the bytes, `inline` with the UTF-8 name, `nosniff`)
  - `DELETE /api/exercise-files/:fileId`: removes the S3 object first, then the row. If S3 fails, nothing changes and the request can be repeated.
  - multer reads names as UTF-8 (`defParamCharset`), so Korean file names are not garbled.
- `backend/src/app.ts`: `createApp(pool, { fileStorage })`, default `s3Storage()`.
- `backend/test/helpers.ts`: tests refuse to call S3 unless they pass a storage; `call` can send a `FormData` and returns the raw bytes and headers.
- `.env.example`, `compose.yaml`: `FILE_BUCKET`, `AWS_REGION`, and optional `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (empty on the server, which uses its IAM role).

## Verification

- Tests added
  - `backend/test/exercise-files.test.ts`: type detection from bytes, name cleanup, every refusal before the DB and S3 (an untouched pool), S3 settings message, S3 commands and error mapping with a stand-in client.
  - `backend/test/exercise-files.integration.test.ts`: upload a problem PDF (Korean name) and an answer PNG named `.jpg`, list, read back bytes and headers, unknown exercise and file, storage failure saves nothing, a failed S3 delete keeps the row, a missing object is 404, rows go with the exercise.
- Commands (2026-11-15, Windows, Docker `db` container)
  - `DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate -w backend`: applied `020_exercise_files.sql` to `study_test`.
  - `TEST_DATABASE_URL=postgres://study_test@localhost:15402/study_test npm run check`: exit 0. Backend 432 tests passed, 0 skipped; the rest of the steps passed.
- Not checked: a real S3 bucket (no bucket or credentials yet).

## Limits and follow-up

- The production nginx (`frontend/nginx.conf`, a centrally managed file) keeps the default 1 MB request body limit, so uploads over 1 MB through it would get 413. Local development through Vite is not affected. This needs a change in `sirloinbh/project-standards` before files are uploaded through the deployed web server.
- Deleting an exercise, chapter or textbook removes the file rows but leaves their S3 objects. Tracked in [#209](https://github.com/sirloinbh/study-log/issues/209).
- No screen yet; #30 adds the upload and review screen.
