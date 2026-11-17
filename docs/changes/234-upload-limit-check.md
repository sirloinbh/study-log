# #234 Check and record the raised upload limit (project-standards#589)

- Issue: [#234](https://github.com/sirloinbh/study-log/issues/234)
- Branch: `docs/234-upload-limit-check`

## Purpose

nginx in the web container refused request bodies over 1 MB, which blocks uploads of up to 20 MiB (#28) and file reading (#30). project-standards PR #615 added a per-app limit (`service.apiBodyMb` in the registry; study-log gets 21, other apps keep 1). The central sync, PR #233, merged on 2026-11-17 and added `client_max_body_size 21m;` to the `/api/` location of `frontend/nginx.conf`. This change checks that result and updates the notes.

## Check (2026-11-17)

`frontend/nginx.conf` from main ran in `nginx:1.27-alpine` (the base image of `frontend/Dockerfile`) on a Docker network, next to a stand-in `api` on port 3102 (`node:24-alpine`) that answered with the number of body bytes it received. Each request was a multipart upload to `/api/upload-test`.

| File size                              | Result                                                    |
| -------------------------------------- | --------------------------------------------------------- |
| 1.5 MiB                                | 200, reached the API (1,573,068 bytes)                    |
| 20 MiB                                 | 200, reached the API (20,971,725 bytes)                   |
| 20.5 MiB                               | 200, reached the API, so the API answers with its own 413 |
| 21.5 MiB                               | 413 from nginx                                            |
| 1.5 MiB with the config before PR #233 | 413 from nginx                                            |

The containers and test files were removed afterwards.

## Limits

- The stand-in API does not check sign-in or store files. The API's own 413 for files over 20 MiB is covered by the #28 tests.
- Not checked with the deployed server: study-log is not deployed yet, and no S3 bucket is configured.

## Changes

- `docs/next-steps/README.md`: removed the #589 row; no candidates are open.
- `docs/daily/2026-11-17.md`: lists PR #232, PR #233 and this check; the #589 line under "Not confirmed" is replaced.

## Verification

- `npm run check` (2026-11-17, `TEST_DATABASE_URL` set to the Docker test DB): exit 0. Backend 444 passed, 0 skipped; frontend 234 passed, 2 skipped; other suites 4 passed.

## Review

- Round 1 (self-review of the diff): no findings. The sizes and status codes match the curl output, and the daily note and next-steps page agree.
