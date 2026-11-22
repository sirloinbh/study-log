# One Claude call helper with a time budget (#268)

## Purpose

Translation and extraction each wrote their own Claude call. Extraction used the SDK defaults (two retries, no bound on a streamed reply), translation allowed 120 seconds with two retries (about six minutes), a `max_tokens` or `refusal` stop was logged as `info`, and translation put the text between `<problem>` tags without escaping a closing tag or checking its length.

## Changes

| File                                 | Change                                                                                                                                                                                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/claude-call.ts` (new)   | `callClaude`: one place for the usage log, the stop-reason checks, the API-failure mapping (`apiFailure` moved here) and the time limit. Budget 240 s in all, 110 s per attempt, 1 retry, enforced by an abort signal (also covers a streamed reply). A call that runs out of time answers 504 |
| `backend/src/claude-usage.ts`        | A `max_tokens` or `refusal` stop is logged as `level: "error"` on stderr                                                                                                                                                                                                                       |
| `backend/src/translation.ts`         | Uses the helper; refuses a body or answer over 40,000 characters before the call (400); escapes `</problem>` and `</answer>` inside the text                                                                                                                                                   |
| `backend/src/extraction.ts`          | Uses the helper (same options for the streamed call; the caller's abort signal is combined with the budget)                                                                                                                                                                                    |
| `backend/test/claude-call.test.ts`   | Fake client: options inside the budget, timeout to 504, `max_tokens` and `refusal` as error lines, other errors pass through, tag escape, over-long text refused before the call                                                                                                               |
| `backend/test/extraction.test.ts`    | The signal assertion follows the combined signal; timeout and retries are asserted                                                                                                                                                                                                             |
| `docs/decisions/extraction-rules.md` | Section 5 (time budget) and the error level for failed stops                                                                                                                                                                                                                                   |

## Choices

- "Under the proxy timeout" needs a number. `frontend/nginx.conf` is a managed file with no `proxy_read_timeout`, so nginx's 60 seconds would apply, and the shared proxy may differ. I set the budget to 240 seconds (`claudeBudgetMs`); the proxy needs `proxy_read_timeout` of 300 seconds or more for `/api/`, which is a change in `sirloinbh/project-standards`. The number is one constant. The coordinator was asked.
- One retry instead of the SDK's two keeps two attempts of 110 seconds inside the budget.

## Verification

See the PR.
