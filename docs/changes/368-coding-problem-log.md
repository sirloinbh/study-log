# #368 Record solved coding problems

Issue: https://github.com/sirloinbh/study-log/issues/368 (epic #355)

## Purpose

Algorithm practice (Baekjoon, LeetCode, other sites) was not recorded anywhere. User decision 2026-11-23: one problem row with many attempts; an attempt with minutes can also create a study log when the user ticks a box (off by default).

## Changes

- `database/migrations/023_coding_problems.sql`: `coding_problems` (site, problem key, title, link; unique per site and key) and `coding_attempts` (date, result, language, minutes, notes, optional `study_log_id`; deleted with the problem, and deleting a study log keeps the attempt).
- `backend/src/coding-problems.ts` (new), mounted at `/api/coding`: list with `site`, `result` (the latest attempt), `q`, `from`, `to`, `limit`; get, add, rename and delete a problem; add, edit and delete an attempt. Every change writes its audit row in the same transaction.
  - Problem key rules: Baekjoon is digits, LeetCode is the lower-cased title slug, another site is any one-line text up to 100 characters. A repeated site and key is 409.
  - The link is optional and only `http` or `https` (never `javascript:`). Baekjoon and LeetCode get their own address when it is left out.
  - `studyLog: { startTime }` on an attempt needs minutes. It creates a done study log of that day and length, with the first review round like any other done log (`syncFirstReview`).
- `backend/src/openapi.ts`, `docs/openapi.json`: the eight routes (there is no `docs/api.md`; the OpenAPI document is the API reference).
- Frontend: `coding.ts`, `coding-attempt-fields.tsx`, `coding-problem-form.tsx`, `coding-problem-detail.tsx`, `coding-problems.tsx`, a "Coding" menu entry and `/coding` route in `app.tsx`, and a small CSS block in `style.css`. The list filters by site, latest result and a search; a problem opens to its attempts.

## Verification

- `backend/test/coding-problems.test.ts`: validation messages with no query reaching the database, slug lower-casing, default links.
- `backend/test/coding-problems.integration.test.ts`: many attempts per problem, 409 on a repeat, the study log (45 minutes from 23:30 ends 00:15) and its review round, filters by the latest result, edit keeping the date, deletes keep the study log, audit rows. DB tests ran in CI only (no local `TEST_DATABASE_URL`).
- `frontend/src/coding-problems.test.tsx`: list, add, repeat error, the study log box, filters, attempt add, edit, delete, problem delete.
- `npm run check`: see the PR.

## Limits

- The list summarises with the latest attempt by date. Two attempts on one date are ordered by id.
- Fetching problem details (#369) and LeetCode import (#370) are separate issues.
