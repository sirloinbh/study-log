# #60 Record the local environment check items in the next-steps document

- Issue: [#60](https://github.com/sirloinbh/study-log/issues/60)
- Branch: `docs/60-next-steps`

## Purpose

During the local environment cleanup on 2026-10-22, steps remained that the user must do by hand (administrator approval, a reboot, an account login). The user asked to write them in a document and to be asked again next time.

## Changes

- `docs/next-steps/README.md`
  - Removed the finished items as of 2026-10-19 (registering issue cards, designing migration `002`).
  - Section "User confirmation needed": installing WSL2 and Docker Desktop, and connecting the Claude in Chrome extension account. For each, wrote the current state and the command the user runs. It states that the agent asks first in the next session.
  - What the agent does after confirmation: start the compose app DB, check the extension connection.
  - Local environment status: the native PostgreSQL 17 test DB, `TEST_DATABASE_URL`, and PATH. I did not write the password, only where it is stored.
  - Next issue candidates (#13, #58, #56, #14).

## Verification

- Only docs changed, so I did not add app tests.
- `npm run format:check`: passed.
- There are no relative links in the document. I checked the commands and paths against the values actually used in this session.

## Automated code review, round 1

A separate read-only review agent reviewed the issue's done criteria and the PR diff. There were no problems with the ports, the issue states, the Windows commands, or not writing secrets.

- Comment (low): the test DB migration command was in POSIX form, so it could not be pasted into PowerShell as it is.
  - Applied: changed to PowerShell form (`$env:PGCLIENTENCODING='UTF8'; psql …`) and wrote that it runs from the repository root.
- Comment (low): the user confirmation items had no way to confirm completion.
  - Applied: wrote that Docker is confirmed with `wsl --status` and `docker version`, and Chrome with the connection indicator on the `/chrome` screen.
- Note: changed the verification record to the issue's standard command, `npm run format:check`.
- Verification: `npm run format:check` passed.

## Automated code review, round 2

A separate read-only review agent checked the first-round fixes (f0178d3) and the whole diff again.

- The PowerShell command syntax, the paths relative to the repository root, and the completion check commands (`wsl --status`, `docker version`, `/chrome`) are correct.
- I checked again that no secrets or account names are written, and the ports (compose.yaml).
- There is nothing to fix. Finished under the policy of at most 2 reviews.
- Verification: `npm run format:check` passed.

## Limits and follow-up

- Asking in the next session is guaranteed by this document and by the agent memory (local, outside the repository).
