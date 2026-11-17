# #245 Log the model and token use of each Claude call

- Issue: [#245](https://github.com/sirloinbh/study-log/issues/245) (parent #244)
- Branch: `feat/245-claude-usage-log`

## Purpose

ADR-0019 (`sirloinbh/project-standards`) chose no LLM gateway: each caller records its own Claude calls. study-log is the only live direct caller, so its translation and extraction calls now log their model and token use, with no new table or package.

## Changes

- `backend/src/claude-usage.ts` (new): `startClaudeCall`, `logClaudeSuccess`, `logClaudeFailure`. One JSON line per call, in the style of the request log in `standard/http.ts`.
- `backend/src/translation.ts`, `backend/src/extraction.ts`: the SDK call (`create`, and `stream(...).finalMessage()`) is wrapped so the line is written when it returns or throws. The error handling after it is unchanged, and the call's error is rethrown as before. Both source types take an optional `requestId`.
- `backend/test/translation.test.ts`, `backend/test/extraction.test.ts`: with a fake client, a successful call logs the fields and token counts, a failed call logs the error type and status, and neither line contains the prompt, the answer or the error message.
- `docs/decisions/extraction-rules.md`: a "Usage log" section.

## Not done

- The routes (`exercises.ts`) do not pass `res.locals.requestId` to the translator and extractor yet, so `requestId` is absent from the lines. They are being changed in another lane; the follow-up is one line in each of the two calls.

## Verification

- Backend `translation` and `extraction` tests: 16 passed. Whole backend run without a DB: 314 passed, 37 failed, all of them `*.integration.test.ts` (no `TEST_DATABASE_URL`). Prettier, ESLint (max-warnings 0) and the backend typecheck pass.

## Review

- See the PR comments.
