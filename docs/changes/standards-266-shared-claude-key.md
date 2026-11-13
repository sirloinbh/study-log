# Read the shared Claude API key from project-standards/.env (sirloinbh/project-standards#266)

## Purpose

Keep the shared Claude API key in one place, `project-standards/.env` on the PC, instead of putting it in each app's `.env` (a change to project-standards ADR-0010, user decision on 2026-10-29).

## Changes

- `dev` in `backend/package.json`: after `../.env`, it also reads `../../project-standards/.env`. It assumes the app clone is in the same parent folder as project-standards. If the file is missing, it is skipped.
- If the same key is in both files, the `project-standards/.env` read later wins. So an empty `ANTHROPIC_API_KEY=` line left in `.env` does not override the shared key.
- `.env.example`: added a note to leave the key empty locally.

## Putting the key in

Run `node tools/app-secrets.mjs pull` in project-standards (a personal AWS profile is needed).
