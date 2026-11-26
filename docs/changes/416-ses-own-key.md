# #416 Send reminder email with a dedicated SES access key

Issue: https://github.com/sirloinbh/study-log/issues/416 (epic #354). Follows #365 and sirloinbh/shared-aws-infrastructure#120.

## Purpose

The infrastructure gives SES rights to a dedicated user, `sirloinbh-apps-study-log-mail`. The server `.env` already uses `AWS_ACCESS_KEY_ID` for the files user (no SES rights), so the sender needs variables of its own.

## Changes

- `backend/src/reminder-sender.ts`: `sesCredentials()` returns explicit credentials from `SES_AWS_ACCESS_KEY_ID` and `SES_AWS_SECRET_ACCESS_KEY` when both are set, else nothing, which keeps the AWS SDK default chain. `sesSender` passes them to the SES client.
- `compose.yaml`, `.env.example`: the two variables (the key is a secret; empty locally).

## Verification

- `backend/test/reminders.test.ts`: both set gives explicit credentials (trimmed); one or none gives the default chain. No SES call is made.
- `npm run check`: see the PR.

## Limits and user tasks

- The real key is created in the console and typed on the server only (shared-aws-infrastructure `docs/operations.md` section 10-0). Not verified against real SES.
