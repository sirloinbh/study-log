# Agent merge policy for PRs that pass CI (#53)

- Issue: https://github.com/sirloinbh/study-log/issues/53
- Date: 2026-10-21 (Asia/Seoul)

## Purpose

The repository owner explicitly instructed a change in the PR merge policy on 2026-10-21. The rule "only the user merges PRs" meant merging had to be requested separately for each project, so I changed the instructions so the agent merges a PR whose required CI passes.

## Changes

- New policy: when all the required CI checks pass, the agent (the main agent and local workers) merges without asking, using `scripts/gh-project.ps1 pr merge <url> --merge --match-head-commit <verified head SHA>` (a merge commit), and checks that the linked issue is closed.
- Stacked PRs: merge in order. After the earlier PR is merged, merge `origin/main` into the next PR's branch to resolve conflicts, re-run the related tests, push normally, and merge after CI passes.
- Still forbidden: merging with a failed or running check, bypassing branch protection with `--admin` or the like, replacing review by approving your own PR, pushing or committing directly to `main`, and force pushes.
- Deployment: currently a `main` merge does not trigger a deployment (CI only does verification and the Docker build, and AWS deployment is not connected). I wrote that in the documents.
- Files changed: `AGENTS.md`, `README.md`, `docs/project-setup.md` (absolute rules, Git strategy, the file roles table, and the AGENTS template), `skills/study-log-{implementation,foundation,testing}/SKILL.md` (including the front matter description of implementation), and the `.claude/skills/` copies updated with `npm run skills:sync`.
- I did not edit the past records (`docs/changes/bootstrap.md`, `docs/daily/`). There was no script or test that enforces the merge restriction (`scripts/test/claude-skills.test.mjs` checks only the sync).

## Verification

Only docs and skills changed and app behavior did not, so I did not add app tests.

- `npm run skills:sync`: copied `.claude/skills/` again from `skills/`.
- `npm run skills:check`: pass (`.claude/skills matches skills/.`).
- `npm run test:skills`: **4 pass / 0 fail / 0 skip**.
- `npm run format:check`: pass.
- skill-creator `quick_validate.py` (`PYTHONUTF8=1`), 3 skills: all `Skill is valid!`.
- I skipped the full `npm run check` (lint, types, app tests, and build) locally. There is no executable code change, and the `verify` job of the PR CI runs the full check.
- In the first commit, one blank line in this record file went against the Prettier rules, so I fixed it in a follow-up commit. After the fix, `npm run format:check`: pass.

## 2026-10-21: automated review after the PR (at most 2 rounds)

### Purpose

The user told me the same day to add to the merge policy again. After opening the PR, go through the automated code review at most twice (review -> fix commit -> second review -> fix commit), split fixes too large for this PR into new issue cards, and then merge when the required CI of the final head passes. If there is nothing to fix, go straight to the CI check and the merge.

### Changes

- `skills/study-log-implementation/SKILL.md`: added the step "5. Automated code review after the PR (at most 2 rounds)" between "4. Test, then create the PR" and "Merge after CI passes". I wrote the first review, going straight to CI when there is nothing to fix, the first fix commit, the second review, no third review after the second fixes, the criteria for splitting large fixes (a feature outside the scope, a design or data structure change, a fix across several modules, and work that needs separate verification), the conditions for holding the merge (a defect that would break main if split out, and a security or data corruption risk), and recording each round in a PR comment and the docs. I renumbered the merge step to "6. Merge after CI passes", and added re-running the related tests against the last commit and that if a new commit appears during review, you do not merge on the earlier CI result. I also fixed the front matter description to include the review step.
- I reflected a short summary in step 5 of `AGENTS.md`, the work order in `README.md`, `docs/project-setup.md` (common rules, the Git strategy order, the review item, the instructions table, and the AGENTS template), and `skills/study-log-{foundation,testing}/SKILL.md`.
- I kept the existing prohibitions (merging with a failed or running check, bypassing protection with `--admin` or the like, approving your own PR, pushing directly to `main`, and force pushes) and the stacked PR procedure as they were.
- I updated `.claude/skills/` with `npm run skills:sync` (`node scripts/claude-skills.mjs sync`). I did not edit the past records (`docs/changes/bootstrap.md`, `docs/daily/`).

### Verification

Only docs and skills changed, so I did not add app tests.

- `node scripts/claude-skills.mjs sync`: updated `.claude/skills/`.
- `npm run skills:check`: pass (`.claude/skills matches skills/.`).
- `node --test scripts/test/claude-skills.test.mjs`: **4 pass / 0 fail / 0 skip**.
- Prettier 3.9.10 `--check .` (the whole repository): pass.
- skill-creator `quick_validate.py` (`PYTHONUTF8=1`), 3 skills: all `Skill is valid!`.
- I skipped the full `npm run check` (lint, types, app tests, and build) locally. There is no executable code change, and the `verify` job of the PR CI runs the full check.
