# 277: One fetch fake and no fixed sleeps in frontend tests

## What changed

- `frontend/src/test/fake-api.ts` is now the only place that replaces `fetch` in screen tests. `fakeApi(handlerOrRoutes)` takes per-path handlers (`'GET /api/x'` routes or one function) and returns `{ sent, requests, requested(match), unexpected }`.
- A request no handler answers rejects the fetch and fails the test in `afterEach`, so a test can no longer pass on an invented reply. Answers support `status`, `body`, `hold` (delay the reply) and `fail: 'network'`. Multipart uploads are recorded as `form` with their `headers`.
- Every screen test file moved onto it: the inline `vi.stubGlobal('fetch', ...)` blocks, the local fakes ported in #272, the stub inside a `useState` initializer in `reviews.test.tsx`, and the catch-all answers in `stats-review.test.tsx` and `study-logs-type.test.tsx`.
- Fixed sleeps (`setTimeout` waits in schedules, textbook-stats, reviews, stats) are replaced with waits on recorded requests or on a later answer. Raised timeouts (`vi.setConfig({ testTimeout })`) are removed. The `.badge` class counts are replaced with role and text queries inside the row.

## Left as is

- Managed files still stub `fetch` themselves and cannot be edited here: `health.test.ts`, `lib/api.test.ts`, `lib/ai-chat.test.ts`, `components/layout/ai-shell.test.tsx`. So `rg "vi.stubGlobal\('fetch'" frontend/src` finds these four plus `test/fake-api.ts`.
- Negative checks of the form "a stale answer is ignored" wait for the held request to settle and flush with `act`; the screen gives no other signal to wait on.
- In `stats.test.tsx` the slow-answer test now picks another period afterwards as its positive signal.

## Checked

- `npm test -w frontend` passed 5 runs in a row (64 files, 508 passed, 3 skipped).
- `npm run check`: see the PR.
