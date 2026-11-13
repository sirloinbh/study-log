---
name: study-log-foundation
description: Establish or improve the repeatable development foundation of the study-log app, covering stack, structure, conventions, API contracts, design, tests, AI guidance, and deployment. Use for project foundation requests; apply only the requested scope through the study-log-implementation issue-to-PR workflow.
---

# Study Log development foundation

Make the way this app is developed, verified, and operated repeatable. First read `AGENTS.md` at the project root and `skills/study-log-implementation/SKILL.md`, then follow this flow: issue -> numbered branch -> implementation with a docs record -> tests and PR -> automated code review (at most 2 rounds) -> merge after CI passes. This skill does not skip the issue and PR steps or grant deploy permission, and merging follows the conditions in the implementation skill.

## Baseline

- The reference document is `docs/project-setup.md`. Check the current package.json, lockfiles, API and SQL, Compose, and CI, and keep what is actually implemented separate from recommendations (not adopted). Do not auto-install the whole recommendation list.
- There is one user (the owner), and login is not a current requirement. Dates use Asia/Seoul.
- When you change or add a tool, first write down the real problem, the data impact, and how you will verify it, and install packages only after the user reconfirms.

## Steps

1. Set the current state and the issue's done criteria, and record the reasons for choices, the structure, and the contracts in the docs.
2. Align tool settings, run commands, CI, and docs in the same change. Do not create unused settings, scripts, or empty modules.
3. For API and DB changes, keep the meaning of existing data, dates, and units, and verify how migrations are applied and how a failure is recovered. Pick one source of DB migrations.
4. For screen changes, use the design tokens (`@sirloinbh/design-tokens`) and the shared UI components (`frontend/src/components/ui/`), and cover loading, empty results, errors, and keyboard access within that scope.
5. Apply `skills/study-log-testing/SKILL.md` too. Write the implementation and tests together, add a regression test for each bug, and record the actual results in the docs and the PR.
6. Deploy only within the scope the user asked for. Prepare image versions, health checks, secret management, backup and restore, and rollback to the previous version.
7. Include a docs record in each work commit and open a verified PR. Go through the automated code review at most twice using the implementation skill's procedure (split large fixes into new issue cards), and merge the PR once all required CI checks pass.

## Done criteria

Installing, running, and verifying must be reproducible in a fresh environment by following the docs, and the chosen tools must show up in the real code, commands, and CI. State tools that are not installed, checks that were skipped, and deployments that were not actually done as follow-up work.
