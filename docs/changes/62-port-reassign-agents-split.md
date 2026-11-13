# #62 Change the ports to the central standard (slot 02) and split out the AGENTS project-specific rules

- Issue: https://github.com/sirloinbh/study-log/issues/62
- Central tracking issue: https://github.com/sirloinbh/project-standards/issues/99

## Purpose

- Apply the ports that the central registry reassigned so the ports of the 8 apps do not overlap (project-standards ADR-0006).
- Before the first central standards sync turns AGENTS.md into the shared instructions, move this project's PR review and merge rules into AGENTS.project.md to keep them.

## Changes

| Kind                       | Before | After         |
| -------------------------- | ------ | ------------- |
| Web                        | 8092   | 8102          |
| API                        | 3012   | 3102          |
| Vite                       | 5172   | 5202          |
| Host DB                    | 55442  | 15402         |
| e2e API and web (reserved) | none   | 3202 and 5302 |

- Files where the ports changed: `.env.example`, `README.md`, `backend/Dockerfile`, `backend/src/server.ts`, `compose.yaml`, `frontend/nginx.conf`, `frontend/vite.config.ts`, `AGENTS.md`
- Moved step 5 of `AGENTS.md` (the automated code review and merge rules) word for word into "Work procedure" of `AGENTS.project.md`, and made `AGENTS.md` require reading that file.
- Past records in `docs/changes/`, `docs/daily/`, and `docs/next-steps/` were not edited because they show the state at the time.

## What the user does

- Change the port in `DATABASE_URL` in the local `.env` from `55442` to `15402`, and `PORT` from `3012` to `3102`. Do not commit `.env`.

## Verification

- 2026-10-22: the results go in the PR body.
