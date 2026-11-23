# Join the split AI_TOOLS_PUBLIC_KEY comment in .env.example (sirloinbh/project-standards#969)

## Purpose

The comment above `AI_TOOLS_PUBLIC_KEY` in `.env.example` had a real line break where the text `\n` should be, so a bare line ` escapes). ...` sat outside the comment. The other apps keep it as one comment line.

## Changes

| File           | Before                                  | After                                           |
| -------------- | --------------------------------------- | ----------------------------------------------- |
| `.env.example` | `one line with` + newline + ` escapes)` | `one line with \n escapes)` on one comment line |

## Verification

- `npm run check`
