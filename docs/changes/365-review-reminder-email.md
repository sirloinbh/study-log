# #365 Review reminder email through AWS SES

Issue: https://github.com/sirloinbh/study-log/issues/365 (epic #354).

## Purpose

User decision 2026-11-24: a daily job at 08:00 Asia/Seoul sends one email on a day with reviews due and none on a day without, through AWS SES. Built and tested with a fake sender; the real SES setup is a user task.

## Changes

- `backend/src/reminders.ts` (new): `buildReminder` lists the study log rounds and exercise reviews due today or overdue (the same sets the Today page shows); `runReminder` does one run; `startReminderJob` checks once a minute inside the API process. The job is off unless `REMINDER_EMAIL_TO` and `REMINDER_EMAIL_FROM` are both set.
- `backend/src/reminder-sender.ts` (new): the SES sender (`@aws-sdk/client-sesv2`, default credential chain, region `SES_REGION` else `AWS_REGION`). Tests use a fake sender and never call SES.
- `database/migrations/034_reminder_sends.sql`: one row per claimed day. The run inserts the day before sending, so a restart at 08:00 or a second container cannot send twice. A failed send deletes the row and the next minute retries; a day with nothing due keeps its row, so it is not re-checked. A server that was down at 08:00 still sends later that day.
- `backend/src/server.ts`: starts the job and stops it on SIGTERM (single spot; not an owned file, see the PR).
- `compose.yaml`, `.env.example`: `REMINDER_EMAIL_TO`, `REMINDER_EMAIL_FROM`, `SES_REGION` (single-spot additions; without the compose lines the container never sees the values).
- Errors are logged as one `reminder_failed` line with the error name only; no addresses or message text.
- No new API route, so there is nothing to add to `docs/openapi.json`; `docs/api.md` does not exist.

## Package review: `@aws-sdk/client-sesv2` 3.1176.0 (approved install)

- Installed with `npm install --ignore-scripts --save-exact @aws-sdk/client-sesv2 -w backend`. Apache-2.0, from `aws/aws-sdk-js-v3`, same family and release train as the already used `@aws-sdk/client-s3`. `npm install` reported 0 vulnerabilities.
- It was published 2026-11-23, less than two weeks before this change. It is the official AWS package at its latest version, so it was kept; a later bump is a normal dependency update.
- The lockfile also moved 18 shared `@aws-sdk/*` / `@smithy/*` packages to the versions the new package needs (no scripts run).

## Verification

- `backend/test/reminders.test.ts` (fake pool and sender): the email lists rounds and exercises and marks overdue ones; singular subject; nothing due builds no email; no send before 08:00 Seoul, one send at 08:30, none on a second run; a failed send releases the day and the retry sends; the job needs both addresses.
- `npm test -w backend` and `npm run typecheck -w backend`: pass. The full `npm run check` result is in the PR.
- Not verified: a real SES send and the migration against a real DB (no local `study_test`; CI runs the migration test).

## Limits and user tasks

- Verify the sender address in SES, give the server's IAM role `ses:SendEmail`, and set `REMINDER_EMAIL_TO`, `REMINDER_EMAIL_FROM` (and `SES_REGION` if it differs from `AWS_REGION`) in the server `.env`; a new account in the SES sandbox can only send to verified addresses. Then check one email.
- One API process is assumed; with several, the claim row still keeps it to one email a day.
