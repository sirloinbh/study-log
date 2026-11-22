# #261 Bind the API to localhost when the sign-in is off

Issue: https://github.com/sirloinbh/study-log/issues/261

## Purpose

Without a sign-in, the API must listen only on 127.0.0.1 and log that it runs unauthenticated.

## Findings

The central sync already did the code work: `backend/src/server.ts` calls `listenHost(auth !== undefined)`, and the managed `standard/auth.ts` `sharedAuth()` logs a warning when the sign-in is off (and refuses to start outside local mode). Only the test from "Done when" was missing.

## Changes

- Added `backend/test/listen-host.test.ts`: `127.0.0.1` with no auth, `0.0.0.0` with auth, `HOST` override, the one-line warning, and the refusal to start outside local mode.

## Verification

- `node --import tsx --test backend/test/listen-host.test.ts` via the backend test script (results in the PR).

## Limits

The fail-open default in `standard/auth.ts` stays a project-standards item.
