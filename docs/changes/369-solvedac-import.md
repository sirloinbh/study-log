# #369 Fill in Baekjoon problems and import the solved list from solved.ac

Issue: https://github.com/sirloinbh/study-log/issues/369 (epic #355). Builds on #368.

## Purpose

Typing a Baekjoon problem number fills in its title, tier and tags from solved.ac, and the problems a solved.ac account has solved can be imported.

## solved.ac research

What was checked on 2026-11-23, and what was not:

- **Endpoints used** (public, no key): `GET https://solved.ac/api/v3/problem/show?problemId=<n>` (a problem: `problemId`, `titleKo`, `level`, `tags[].key`) and `GET https://solved.ac/api/v3/search/problem?query=solved_by:<handle>&sort=id&direction=asc&page=<n>` (`count` and `items[]`, 50 per page). These shapes come from the community documentation (`solvedac/unofficial-documentation`, which now points to the official docs at backstage.solved.ac/ko/developer/docs). The response fields were **not confirmed against live answers**, see the next point.
- **A plain request from this Mac got a Cloudflare bot challenge** (HTTP 403, `cf-mitigated: challenge`, HTML body) for both endpoints. This is not worked around. So the live behaviour of the endpoints, the rate limit and the terms could not be verified here. The client treats a non-JSON or 403 answer as "solved.ac did not answer the request (status 403)", and the screen shows that text. **Whether the production server's address is also challenged is unknown until the first real call.**
- Rate limit: not verified. A run reads at most 100 pages (5,000 problems); a normal handle needs a few pages. A 429 answer is reported as "asked to slow down".
- Terms: the official docs page is a script-rendered page that could not be read here; nothing in this change depends on a term beyond using the documented public endpoints with a plain `User-Agent` (`study-log (personal study tracker)`).

## Changes

- `backend/src/solvedac.ts` (new): the client. 10 s timeout, strict Zod checks with limits (problem number 1 to 9,999,999, title cut at 200, level 0 to 40, at most 30 tags, at most 100 items per page), the answer must be for the problem asked, errors become short messages without the URL.
- `backend/src/coding-solvedac.ts` (new), mounted at `/api/coding/solvedac`:
  - `GET /problems/:number` for the form (404 when solved.ac has none, 503 when it fails).
  - `POST /import`: reads all pages first, then one transaction inserts with `ON CONFLICT (site, problem_key) DO NOTHING` and one audit row. Returns `{ added, skipped, total }`. Recorded problems are left as they are. Imported problems have no attempts.
- `database/migrations/025_coding_problem_tier_tags.sql`: `level` and `tags` on `coding_problems`. `POST /api/coding/problems` accepts them.
- Config: `SOLVEDAC_HANDLE` (not a secret) in `.env.example` and `compose.yaml`. **The handle still has to be given by the user.** Without it the import answers 503 "The solved.ac handle (SOLVEDAC_HANDLE) is not set on the server".
- Frontend: "Fill in from solved.ac" on the form for Baekjoon (title, tier and tags, saved with the problem), an "Import from solved.ac" card, tier and tags in the list. Tier names follow the solved.ac levels (1 Bronze V ... 30 Ruby I, above Master).
- `backend/test/helpers.ts`: `withApi` takes `solvedAcClient` and `solvedAcHandle`, and refuses real solved.ac calls by default.

## Verification

- `backend/test/solvedac.test.ts`: client reading, validation, cut titles, error messages, routes, import reading every page before the database.
- `backend/test/coding-problems.integration.test.ts`: importing twice adds once and keeps a problem recorded by hand (CI only, no local `TEST_DATABASE_URL`).
- `frontend/src/coding-problems.test.tsx`: fill-in, failed lookup, import result, tier names.
- `npm run check`: see the PR. No real solved.ac call was made successfully.

## Limits

- Not verified against the live API (see research). The first real use needs a check by the user.
- An import starts at the first problem each time and reads at most 5,000 problems.
- Only Baekjoon; LeetCode is #370.
