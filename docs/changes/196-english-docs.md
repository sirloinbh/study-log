# Translate the current Korean docs to English (#196)

## Purpose

The user asked on 2026-11-12 that every markdown file in every project be English (tracking issue sirloinbh/project-standards#487). This change covers the markdown files outside `docs/changes/`, `docs/daily/`, and `docs/adr/` that are not centrally managed.

## Changes

| File                                                                         | Change                               |
| ---------------------------------------------------------------------------- | ------------------------------------ |
| `README.md`, `backend/README.md`, `frontend/README.md`, `database/README.md` | Translated to English                |
| `docs/project-setup.md`                                                      | Translated to English                |
| `docs/decisions/review-rules.md`, `docs/decisions/schedule-rules.md`         | Translated to English                |
| `docs/next-steps/README.md`                                                  | Translated to English                |
| `skills/study-log-*/SKILL.md`                                                | Translated to English                |
| `.claude/skills/study-log-*/SKILL.md`                                        | Copied from `skills/` (same content) |

Commands, paths, identifiers, issue numbers, and dates are unchanged. Heading anchors that other files link to were checked: the only anchor link, in `docs/project-setup.md`, now points to `#11-bootstrap-checklist`.

## Kept in Korean

- `docs/project-setup.md`: the example app display name `FORM · 나의 운동 기록` and the example brand `'기타'`, which are example data from another project (English glosses added next to them).

## Verification

- `node node_modules/prettier/bin/prettier.cjs --check` on the changed files
- `node scripts/claude-skills.mjs`: `.claude/skills` matches `skills/`
- A Hangul search over the scope returns only the two exceptions above
