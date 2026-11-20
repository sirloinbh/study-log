# Adopt the shared db and rate-limit modules (project-standards#709, part 1)

- `inTransaction` (sql.ts) now runs on the managed `withTransaction`: BEGIN, COMMIT and ROLLBACK are no longer hand-written here. It keeps the `commit` callback (roll back and still return the result) through a private sentinel.
- `src/pool.ts` (`connectPool`) is `createPool(new Pool(...))` plus a per-connection `error` listener: pg stops listening on a checked-out client, so a lost connection in a transaction would end the process otherwise (#133). The managed `createPool` covers idle clients only.
- `app.ts` uses `apiRateLimit(app)`: 600 per minute per client IP (the last X-Forwarded-For entry, which nginx appends), health is not counted, the 429 text is the managed one. The old default was 1200 counted as one client for all requests.
- A destroyed client is released with `true` (managed) instead of the rollback error.
- Not in this PR: the OpenAPI builder (needs typed path params in the managed builder; see the issue).
- Verification: typecheck, eslint, prettier, non-DB tests. DB tests run in CI.
