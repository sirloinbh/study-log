# #271 Keep a keyword's date when an update leaves it out

Issue: https://github.com/sirloinbh/study-log/issues/271

## Purpose

`PUT /api/keywords/:id` without `date` moved the keyword to today (`input.date ?? today()`), so a client that edits only the keyword and memo changed its date by accident.

## Changes

- `backend/src/keywords.ts`: the update uses `COALESCE($2::date, keyword_date)` and sends `null` when `date` is left out. Adding a keyword still defaults to today. Comments updated.
- `backend/src/openapi.ts` and `docs/openapi.json` (regenerated with `npm run openapi`): the PUT summary now says a left-out date keeps the stored date. There is no `docs/api.md` in this repo; the OpenAPI file is the API doc.
- Tests: `backend/test/keywords.test.ts` checks the SQL and that `null` is sent without a date; `backend/test/keywords.integration.test.ts` updates a keyword without `date` and checks the date is unchanged.

## Verification

- `keywords.test.ts` run locally. The integration test needs `TEST_DATABASE_URL`, so it ran in CI only.
- `npm run check`: see the PR.
