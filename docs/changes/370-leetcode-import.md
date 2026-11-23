# #370 Import accepted LeetCode submissions

Issue: https://github.com/sirloinbh/study-log/issues/370 (epic #355). Builds on #368 and #369.

## Purpose

LeetCode practice was not recorded in the app. User decision 2026-11-24 (option A): import the recent accepted submissions of a configured user, get the difficulty with `question(titleSlug)`, be idempotent on (leetcode, slug), add one "solved" attempt per problem dated in Asia/Seoul, and add a difficulty column.

## LeetCode research (2026-11-23)

- LeetCode has no official API. Its site uses the public GraphQL endpoint `https://leetcode.com/graphql`, which answered a plain POST without sign-in (HTTP 200) for both queries below. There is no published rate limit or terms for it; this change makes few requests (one list, plus one per new problem) with an honest `User-Agent` and a 10 s timeout, and reports a 429 as "asked to slow down".
- `recentAcSubmissionList(username, limit)` returns `title`, `titleSlug`, `timestamp` of the user's most recent accepted submissions. It is a recent list only (believed to be capped at about 20; not verified because the probe account had no submissions), so the full history is not reachable without a sign-in cookie, which is not stored.
- `question(titleSlug) { difficulty }` returns Easy, Medium or Hard.
- Not verified: the cap of the list, and the answer for a real account with submissions.

## Changes

- `backend/src/leetcode.ts` (new): client with strict Zod checks (slug pattern and 100 characters, title cut at 200, at most 100 items, difficulty must be one of the three), a null list for a hidden or unknown profile means empty, short error messages that never hold the URL.
- `backend/src/coding-leetcode.ts` (new), `POST /api/coding/leetcode/import`: reads the list, keeps the first accepted submission of each problem, skips problems already recorded (and does not look their difficulty up), looks up the difficulty of new ones before touching the database (a failed lookup stops the run with nothing saved), then inserts the problem and a `solved` attempt in one transaction with one audit row. Returns `{ added, skipped, total }`.
- `database/migrations/032_coding_problem_difficulty.sql`: `difficulty` on `coding_problems`.
- `LEETCODE_USERNAME` (not a secret) in `.env.example` and `compose.yaml`. **The username still has to be set by the user.** Without it the import answers 503.
- Frontend: "Import recent LeetCode submissions" button in the Import card, difficulty in the problem list.
- `backend/test/helpers.ts`: `withApi` takes `leetCodeClient` and `leetCodeUsername` and refuses real LeetCode calls by default.

## Verification

- `backend/test/leetcode.test.ts`: client reading and refusals, the username check, a failed lookup writing nothing, one attempt per new problem with the Seoul date (2023-11-14 15:30 UTC is 2023-11-15), recorded problems not looked up.
- `backend/test/coding-problems.integration.test.ts`: importing twice adds once and leaves one attempt each (CI only, no local `TEST_DATABASE_URL`).
- `frontend/src/coding-problems.test.tsx`: the import button and the difficulty.
- `npm run check`: see the PR. No real LeetCode call was made by the tests.

## Limits

- Only the latest accepted submissions (about 20) are available, so the import has to be run regularly.
- An imported attempt has no language or minutes: the list does not give them.
- The unofficial endpoint can change or block without notice.
