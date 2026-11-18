# #248 Add the request ID to the Claude usage log

- Issue: [#248](https://github.com/sirloinbh/study-log/issues/248) (parent #244)
- Branch: `feat/248-usage-request-id`

## Purpose

#245 logs one JSON line per Claude call, but `requestId` was left out because the routes were being changed by the OpenAPI contract work. That work is merged, so the routes now pass the request ID and a usage line can be matched to its request log line.

## Changes

- `backend/src/app.ts`: `app.use(requestLog)` runs first. The standard `requestLog` (#552) was synced into `standard/http.ts` but never mounted, so `res.locals.requestId` was never set and no route could pass an ID. Mounting it also gives every request an `X-Request-Id` header and one JSON request log line, and clears the `.standards/check.mjs` warning about the missing `app.use(requestLog)`.
- `backend/src/exercises.ts`: the translation route and the extraction route pass `requestIdOf(res)` (from `standard/http.ts`, the value the request-ID middleware sets) to the translator and the extractor. `translation.ts` and `extraction.ts` already accept it.
- `backend/test/exercise-translations.integration.test.ts`, `backend/test/exercise-extraction.integration.test.ts`: the request is sent with `X-Request-Id: req-248` and the stand-in translator/extractor must receive that `requestId`. The unit tests from #245 already check that the usage line carries a given `requestId`.

## Verification

- See the PR body.

## Review

- See the PR comments.
