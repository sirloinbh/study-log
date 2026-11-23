# 362: Draft a retrospective with Claude

## What changed

- `backend/src/retrospective-draft.ts`: a `Drafter` (injectable, like the translator) that sends the period's records to Claude Sonnet 5.5 through `callClaude`, so it has the shared timeouts, one retry, the usage log line (feature `retrospective`, added to `ClaudeFeature` in `claude-usage.ts`) and the refusal / cut-off handling. The reply is a JSON object with one `body`, checked against the 20000-character retrospective limit.
- The records go in as plain lines inside `<records>` tags (a closing tag in a memo is escaped, and the system prompt says they are material, never instructions): per study log the date, minutes, type, textbook, understanding, goal result, memo and difficult parts; plus the period's keywords. Size cap: each text is cut to 300 characters, at most 200 logs and 100 keywords, and the whole input to 24000 characters.
- `POST /api/retrospectives/:kind/:start/draft` (in `retrospectives.ts`): JSON requests only (a draft costs money, same guard as translation), refused with 400 before any paid call when the period has no logs that are not planned, 409 while a draft for the same period runs, 503 when all Claude slots are busy (shared with translation and extraction), and the paid call stops when the tab goes away. Nothing is saved: the response is `{draft, model}`.
- `createApp` takes an optional `drafter` (tests pass a stand-in, and `withApi` refuses real calls); OpenAPI table and `docs/openapi.json` list the route.
- Frontend: a "Draft with Claude" button next to Save fills the editor with the draft and says "Draft ready. Edit it, then save". If the editor already has text, a confirm dialog asks before replacing it. The request waits up to 270 s (the server gives up at 240 s; the shared 30 s default would cut it short), so it uses `requestJson` directly.
- Language of the draft: the language most of the memos use, Korean when unsure (my choice, easy to change in the prompt).

## Tests

- `backend/test/retrospective-draft.test.ts` (no DB): what is sent to Claude, fence escaping and the size caps, refused / cut-off / unreadable / too long replies, the 415 and Sunday checks before the database.
- `backend/test/retrospective-draft.integration.test.ts` (needs `TEST_DATABASE_URL`, CI only): an empty period is refused before any call, only the period's non-planned logs and keywords reach the drafter, nothing is saved, a failed call keeps its status, a second draft for the same period is 409.
- `frontend/src/retrospectives.test.tsx`: the draft fills the empty editor and saves nothing, saving is a separate step; a draft over written text asks first; a failed draft is shown and the text stays.

## Checked

- Browser (Vite, mock API with a 1.2 s draft): 390x844 and 1440x900, the button is disabled while the draft runs, the editor fills, the status line says so, the replace dialog appears over written text, no overflow.
- The real Claude API was not called (no key in tests). Backend integration tests ran in CI only. `npm run check` and CI: see the PR.
