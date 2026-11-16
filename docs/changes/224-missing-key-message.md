# #224 Say the Claude API key is missing instead of a service error

- Issue: [#224](https://github.com/sirloinbh/study-log/issues/224)
- Branch: `fix/224-missing-key-message`

## Purpose

When `ANTHROPIC_API_KEY` is not set, translation (#31) and file extraction (#30) should answer 503 "The ... API key (ANTHROPIC_API_KEY) is not set on the server". On this PC they answered 502 "... service error" instead.

Found on 2026-11-16 while preparing a real extraction test: running the extractor with no key gave 502.

## Cause

`@anthropic-ai/sdk` 0.132.1 throws a plain "Could not resolve authentication method" error when it finds no credentials at all, which `apiFailure` already handled. But when an Anthropic CLI sign-in profile exists (`%APPDATA%\Anthropic\configs\default.json`) and its credentials file does not, the SDK falls back to that profile and throws `WorkloadIdentityError` ("Credentials file not found at ..."). `apiFailure` did not know that class, so it fell to the generic 502. A server without such a profile still got the right 503.

## Changes

- `backend/src/translation.ts`: `apiFailure` also treats `WorkloadIdentityError` (imported from `@anthropic-ai/sdk/lib/credentials/types`) as a missing key: 503 with the same message. Translation and extraction share it.
- `backend/test/translation.test.ts`: a test with the real SDK client, not a fake. It removes the Anthropic environment variables, points `ANTHROPIC_CONFIG_DIR` at a temp folder holding a `user_oauth` profile with no credentials, and uses `http://127.0.0.1:9` as the base URL so no request can reach the API. It checks both translation and extraction answer 503 with the "not set" message. It failed (502) without the fix and passes with it.

## Verification

- New test run against the old `translation.ts` (git stash): failed. With the fix: passed.
- `npm run check` (2026-11-16, `TEST_DATABASE_URL` set to the Docker test DB): exit 0. Backend 444 passed, 0 skipped; frontend 232 passed, 2 skipped; other suites 4 passed.
- Before the check, `npm ci --ignore-scripts` installed `@sirloinbh/auth-client` 1.0.0 from the lockfile; main had added it in #221 (PR #212).
