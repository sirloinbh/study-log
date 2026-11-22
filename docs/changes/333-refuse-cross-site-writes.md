# #333 Refuse cross-site state-changing requests in the API

Issue: https://github.com/sirloinbh/study-log/issues/333

## Purpose

Four routes change data on a POST with no body (`POST /api/reviews/:id/complete`, `/snooze`, `POST /api/schedules/:id/items/:itemId/complete`, `/reopen`). A form on another site can send such a POST without a CORS preflight. Uploads, extraction and translation already had their own guards (#28, #30, #31); these four did not.

## Changes

- `backend/src/cross-site.ts` (new): `refuseCrossSiteWrites`. For POST, PUT, PATCH and DELETE it answers 403 `{ error: 'This request came from another site' }` when `Sec-Fetch-Site` is present and is not `same-origin` or `none`. A request without the header (curl, scripts, shared-ai) and every GET, HEAD and OPTIONS pass.
- `backend/src/app.ts`: registered on `/api` before the body parser. `/internal/tools` is not under `/api` and is unaffected.
- `backend/test/cross-site.test.ts` (new): all four routes and a PUT, PATCH and DELETE get 403 for `cross-site` and `same-site` with no query reaching the database; `same-origin`, no header, and a cross-site read still work.

## Verification

- `cross-site.test.ts`: 2 pass. `npm run check`: see the PR.
- The browser reaches the API only through the Vite or nginx proxy, so the app's own requests are `same-origin`. The e2e run in CI covers that.

## Limits

- Old browsers that do not send `Sec-Fetch-Site` are not covered by this check. The sign-in cookie's SameSite setting was not checked here.
