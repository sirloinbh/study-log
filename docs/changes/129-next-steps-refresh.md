# #129 Refresh the next-steps document to the current state

- Issue: [#129](https://github.com/sirloinbh/study-log/issues/129)
- Branch: `docs/129-next-steps-refresh`

## Purpose

The user asked to put getting the Public Data Portal API key into "what the user does by hand later" (2026-10-31). `docs/next-steps/README.md` still listed issues that were already closed and old ports, so those were fixed too.

## Changes

- Added the reboot, the package install, and the API key to the by-hand list. Changed WSL and Docker to installed.
- Fixed the app DB port to 15402 and the web port to 8102.
- Changed the next issue candidates to #42, #43, #33, #34, and #28.

## Review

The first review found two things, and they were fixed.

- Package installs and Docker image builds need `NODE_AUTH_TOKEN`, but it was missing. I checked that this PC has no token in its environment variables and wrote that down.
- Migrations 008 to 011 were missing from the test DB, so the integration tests would fail. I applied the four files and confirmed that the 4 tables exist.

## Verification

Only docs changed, so no app tests were added. Aligned with the local Prettier without project settings. The shared packages are not installed locally, so `npm run format:check` is confirmed with the CI result.

This PR does not close #129. #129 is closed when the user gets the key.
