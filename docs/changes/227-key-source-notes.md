# #227 Record #224 and where the Claude key comes from

- Issue: [#227](https://github.com/sirloinbh/study-log/issues/227)
- Branch: `docs/227-key-source-notes`

## Purpose

After PR #225 the records were behind: the 2026-11-16 daily note did not list #224 or the sign-in sync, and the next-steps page still told the user to put `ANTHROPIC_API_KEY` in study-log's `.env`.

## Changes

- `docs/daily/2026-11-16.md`: added #221 (PR #212 and #223, from central syncs) and #224 (PR #225) to the merged list. A new "Claude key" section says the key is in SSM and in `project-standards/.env`, which `npm run dev` loads. "Not confirmed" now says the real-call script is ready but not run.
- `docs/next-steps/README.md`: last updated 2026-11-17; #30 gets the key from `project-standards/.env`; the backend test count is 444.

## Verification

- `npm run check` (2026-11-17, `TEST_DATABASE_URL` set to the Docker test DB): exit 0. Backend 444 passed, 0 skipped; frontend 232 passed, 2 skipped; other suites 4 passed.
- PR and issue numbers in the daily note were checked against `git log --first-parent` on main.
