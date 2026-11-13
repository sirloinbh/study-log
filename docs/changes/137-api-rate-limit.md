# #137 Add a request rate limit to the API server

- Issue: [#137](https://github.com/sirloinbh/study-log/issues/137)
- Branch: `feat/137-api-rate-limit`

## Purpose

CodeQL recognizes only Express middleware, so it raises a `js/missing-rate-limiting` warning for each new route. So far 34 were closed as false positives, and PR #135 was blocked by the same warning. The user decided to add an Express limit instead of dismissing them as false positives (2026-10-31).

## Changes

- `backend/package.json`: added `express-rate-limit` 8.7.2. The user installed it with `--ignore-scripts`.
- `backend/src/app.ts`: limits all of `/api` to 1200 per minute. Above that, it answers with a Korean 429. It is placed before body parsing so rejected requests are not parsed.

## Decisions

- I set the limit more generously than nginx's 10 per second (600 per minute). nginx handles the per-user limit, and Express is a safety net.
- `frontend/nginx.conf` does not put the client address in `X-Forwarded-For`, so requests that went through nginx are all counted as one client in Express. This differs from the issue's "per-IP limit", but there is one user and nginx already limits per IP, so I leave it.
- I did not turn on `trust proxy`. nginx passes the header the client sent as it is, so turning it on would trust a forged header. With it off, the header is ignored. But the library writes an error log when it sees this header, so I turned off those 2 validations.
- I excluded GET and HEAD of `/api/health` from the limit. Deployment and monitoring look at this response, so a normal API must not be judged as down because there are many other requests.
- Restarting the server resets the counter. It is an in-memory store, and the API runs as one process.

## Tests

`backend/test/rate-limit.test.ts`: a Korean 429 and no DB access above the limit, a bad body is rejected first, the health check is excluded, a forged header cannot bypass it and there is no log, and 100 concurrent requests pass at the default limit.

## Review

The first review had 3 findings.

- nginx passes the client's `X-Forwarded-For` as it is, so an error log was written, and the explanation in the document was wrong. I turned off the validation and fixed the document.
- `/api/health` shared the limit with other requests. I excluded it from the limit.
- The comment "there is no limit on the API itself" in `frontend/nginx.conf` is no longer correct for this app. It is a centrally managed file, so I leave an issue in `sirloinbh/project-standards`.

## Known problem

The 1 high in `npm audit` is not from this package but the existing `zod` 3.25.76 (affects versions before 4.6.6). It is the major version upgrade that PR #115 handles, so I do not fix it in this PR.

In the second review, it was pointed out that the health exclusion does not look at the method, so `POST /api/health` also parses a body without a limit. I narrowed it to GET and HEAD and added a test. The review is limited to 2 rounds, so I did not do a third review.

## Verification

- `npm run check` with `TEST_DATABASE_URL` set passed. Backend 285 and skills 4 all passed (0 skipped).
- The frontend had 52 passed and 2 skipped. The 2 skipped are dark-only app tests that came from the central standards and do not apply to this app.
- I checked `npm run standards:check` and `npm run lockfiles:sync` (no change).
- Whether CodeQL recognizes this middleware is checked in PR #135, which has a new route.
