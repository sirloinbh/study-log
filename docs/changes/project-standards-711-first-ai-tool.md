# First AI tool: list_study_logs and the audit_log table (project-standards#711)

Follows project-standards `docs/conventions/first-ai-tool.md`. One PR adds the tool and its audit table together.

- `backend/src/ai-tools.ts`: one read-only tool, `list_study_logs` (entity `study_log`, access and action `read`). Input: optional `from` and `to` dates, an optional `textbookId` and a `limit` (1 to 100, default 20), newest first. It uses the same query as `GET /api/study-logs` through the new `listStudyLogs(db, query)` in `study-logs.ts`; the route calls it with its parsed query, so its answer and SQL are unchanged. The tool returns the memo and difficulties text because the route returns them to the owner too.
- `database/migrations/021_audit_log.sql`: the `audit_log` table, copied unchanged from the scaffold's `002_audit_log.sql`.
- `backend/src/app.ts`: `registerToolRoutes(app, { app: 'study-log', tools, pool, publicKey: options.toolsPublicKey, requireBinding: true })` before the `/api` 404 handler; `server.ts` passes `AI_TOOLS_PUBLIC_KEY`.
- `compose.yaml`: `AI_TOOLS_PUBLIC_KEY`, the `shared-ai` network with the alias `study-log-api`, and the external `shared-ai` network. `.env.example`: `AI_TOOLS_PUBLIC_KEY` with its SSM name.
- `/internal/tools` is served only when `AI_TOOLS_PUBLIC_KEY` is set; it is outside `/api`, so the proxy never reaches it. This app has no `docs/api.md`, so the line is only here.
- Tests: `ai-tools.integration.test.ts` (list, scopes, signature, audit rows `denied`, `ok`, `error`; off without the key; runs in CI) and `ai-tools-binding.test.ts`.
- Verification: typecheck, eslint, prettier, the non-DB tests. The DB tests run in CI. The live check follows after the merge.
