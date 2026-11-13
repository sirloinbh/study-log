# Fix outdated descriptions in the app skills (sirloinbh/project-standards#313)

## Purpose

Two places in the app skills were written differently from the current state (chapter 3 of sirloinbh/project-standards `docs/research/convention-survey.md`).

## Changes

| File                                   | Before                                                          | After                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `skills/study-log-testing/SKILL.md`    | "Vitest and Playwright, which are not adopted yet"              | Frontend Vitest and Testing Library and backend `node:test` are installed. Playwright is not installed |
| `skills/study-log-foundation/SKILL.md` | Design tokens are the CSS variables in `frontend/src/style.css` | `@sirloinbh/design-tokens` and the shared UI components (`frontend/src/components/ui/`)                |
| `.claude/skills/`                      | n/a                                                             | Copied with the same content by `npm run skills:sync`                                                  |

I did not change the review and merge procedure (`study-log-implementation`, `AGENTS.project.md`).

## Verification

- `node scripts/claude-skills.mjs`: `.claude/skills matches skills/.`
