# Translate Korean code comments to English (#194)

- Issue: [#194](https://github.com/sirloinbh/study-log/issues/194) (tracking: sirloinbh/project-standards#487)
- Branch: `chore/194-english-comments`

## Purpose

The user asked on 2026-11-12 that every code comment in every project be English.

## What I found

A scan of every tracked file that is not centrally managed found 1,019 lines with Hangul. Only 20 of them are in comments. The other lines are strings that the code or tests use (UI text, validation messages, test names, and fixtures), which this issue leaves alone because UI and test strings belong to the screen-text issue under sirloinbh/project-standards#457.

Of the 20 comment lines:

- 6 lines in `.env.example` were fully Korean. They are now English.
- 6 lines in `database/migrations/014` to `019` use the word "chapter" in Korean (for example `rule 4장`) inside an English comment. I did not change them because the migration tool refuses a file whose checksum changed after it was applied (see `database/README.md`).
- 8 lines in tests and `frontend/src/toc.ts` are English comments that quote a Korean fixture value (for example `"벡터 ...... 12"`). The quoted value is the test data, so I kept it.

## Changes

- `.env.example`: translated the comments for `ANTHROPIC_API_KEY`, `HOLIDAY_API_KEY`, and `WEB_BIND`/`WEB_PORT`. No setting changed.

## Verification

- `npm run standards:check`: passed.
- No code, test, or SQL changed, so there is no behavior change.
