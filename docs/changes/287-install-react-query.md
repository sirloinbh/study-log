# 287: Install @tanstack/react-query (step 1 of the shared query layer)

## What changed

- Added `@tanstack/react-query` 5.104.1 (exact) to `frontend/package.json` and the lockfile, installed with `npm install --ignore-scripts --save-exact`. The user approved this install for #287 on 2026-11-23 (see the issue comments; ADR-0027).
- No code uses it yet. The shared layer (`frontend/src/lib/query.ts`: `useApiQuery`, `useApiMutation`) arrives through the central sync once `features.query` is true for study-log in `project-standards` `registry/projects.json`. The screens move to it in later PRs, one screen per commit.

## Package review (docs/dependency-policy.md)

| Check                         | Result                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Version                       | 5.104.1, MIT, TanStack (`TanStack/query`)                                                                             |
| Install scripts               | None; installed with `--ignore-scripts`                                                                               |
| Dependencies                  | `@tanstack/query-core` 5.104.1 only; peer `react` ^18 \|\| ^19                                                        |
| Lockfile diff                 | Two packages added (`@tanstack/react-query`, `@tanstack/query-core`) and the one workspace line; nothing else changed |
| `npm audit` (install output)  | 0 vulnerabilities                                                                                                     |
| `lockfiles:sync` / `ioc-scan` | This repo has no such script yet, so neither was run                                                                  |

## Everyone must run `npm ci` after this merges.
