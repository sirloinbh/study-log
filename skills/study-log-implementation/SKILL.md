---
name: study-log-implementation
description: Follow the user's issue, numbered branch, implementation with docs, tests, PR, up to two automated review rounds, and merge-after-CI workflow for changes to the sirloinbh study-log project. Use for code, configuration, documentation, and skill edits; exclude read-only questions and recommendations. Review each PR at most twice with fix commits, split large fixes into new issues, merge with a merge commit once required CI passes, and resolve conflicts between stacked PRs.
---

# Study Log implementation procedure

This skill applies to changes in `sirloinbh/study-log`. Do not apply this account, repository, or policy to other projects. First read `AGENTS.md` at the project root and the related documents. Follow the order below, go through the automated code review (at most 2 rounds) after the PR, and finish by merging the PR once the required CI passes.

## 1. Register an issue card

- Check the GitHub remote URL and `gh api user --jq .login`. The expected account is `sirloinbh`; if it is another account, do not make remote changes until the authentication is fixed.
- Reuse the issue the user named, or one already registered for the same request. Check the existing result before a retry so you do not create duplicate issues.
- In a new issue, write the problem and purpose, the requested scope, and the done criteria and how to verify them. In this project, an issue card means a GitHub Issue. Unless a separate Projects board was specified, do not create or link a board.
- Write the body to a UTF-8 temporary file and register it with `gh issue create --repo sirloinbh/study-log --title ... --body-file ...`. Do not put tokens or secrets in the body.
- Keep the real issue number and URL that were issued. If registering the issue fails, do not invent a number or start code changes first.

## 2. Create a branch from the issue number

- Check the working tree and the current branch. If there are changes from other work, preserve them and avoid mixing work.
- The default target branch is `main`. Do not start new work from an unrelated unmerged work branch. In a clean working tree, fetch origin main and branch from it. If there are user changes, prepare a workspace that keeps them safe.
- Branch name: `<type>/<number>-<short-slug>`. Examples: `feat/12-first-feature`, `fix/13-goal-date`, `docs/14-project-skills`, `chore/15-ci`.
- If a branch for the same issue already exists, check its state and keep using it.
- Make changes and commits on this branch. Do not commit or push directly to `main`.

## 3. Implement, and write a docs record for each commit

- When you implement or change something, read the project's `skills/study-log-testing/SKILL.md` and write or update the related tests together. A bug fix adds a regression test. Include the implementation, tests, and docs in the same work commit, and run the related tests before committing.
- Implement only the requested scope. For development foundation work, also read `study-log-foundation`.
- Create `docs/changes/<number>-<slug>.md` and record the issue link, purpose, changes, verification, and limits and follow-up work.
- **Record, in the docs, the changes and verification done in each work commit, in that same commit.** You may accumulate entries in one issue document. A commit that only edits docs also updates the record for that work.
- Record why the change was made and what was observed. Do not write that a check or deployment is done when you did not run it. You do not need to make up the SHA that points to the commit itself; tell commits apart by the commit title or the unit of work.
- A commit title includes the type and the issue number, as in `feat: ... (#12)`, `fix: ... (#13)`, `docs: ... (#14)`.
- Before staging, check the diff and whether it contains secrets, and stage only the related files by name. Do not include another user's changes.

## 4. Test, then create the PR

- Before you create or update the PR, run the related tests and required checks on the final changes. Record in the docs and the PR the test code you added or changed, the behavior verified, the commands actually run, and pass/fail/skip. Follow the project `AGENTS.md` for the required commands and the DB integration test conditions. Do not add unnecessary app tests for a simple docs or skill change.
- Fix failures, and separate checks that were not run, DB tests that were skipped, and browser verification that was not finished in the docs and the PR. If required verification is blocked, create the PR as a draft.
- Push only the work branch. The PR target is `main` of `sirloinbh/study-log`. The subtree sync script pushes main and the sub-repositories, so do not use it at this step.
- If a PR for the same head branch exists, update it and do not create a duplicate.
- Pass the PR body as a UTF-8 file. Include the problem and the behavior after the change, the main changes, the actual check commands and results, evidence for screen changes when possible, and `Closes #<number>`. If there are no images, state why and the limits of the verification.
- Check the GitHub Actions results and resolve related failures. Say so if a check is still running. If you changed code after creating the PR, re-run the affected checks and update the docs and PR results.

## 5. Automated code review after the PR (at most 2 rounds)

After you open the PR, go through the automated code review at most twice. If there is nothing to fix, go straight to the CI check and the merge.

1. **First review**: after you open the PR, run a read-only review that is separate from the authoring context (a separate agent, a review tool, and so on). Check correctness, regressions, security, missing tests, and the docs record against the issue's done criteria and the whole PR diff.
2. **If there is nothing to fix**, end the review and go on to the CI check and the merge.
3. **If there is something to fix**, apply only the comments that should be fixed within this PR's scope. Make an additional commit that includes the related tests and docs record, and push.
4. **Second review**: check that the first comments were applied and check the added diff. Also look at the whole final PR diff. If there is nothing to fix, go on to CI.
5. **Second fixes**: apply the second comments in an additional commit. The review is limited to 2 rounds, so do not do a third review; go on to CI.
6. **Split large fixes**: do not fix comments of the following kinds in this PR. Instead, create a new issue card (with the problem, scope, and done criteria) in `sirloinbh/study-log`. Leave the issue link in a PR comment and in the docs record, and keep going with this PR.
   - A feature outside the requested scope
   - A change to the design or data structure
   - A fix that spans several modules
   - Work that needs separate verification
7. **Hold the merge**: if either of the following defects remains, do not merge and tell the user.
   - A defect that would break main if split out
   - A defect that risks security or data corruption
8. **Record**: leave the result of each review round in a PR comment and in `docs/changes/<number>-<slug>.md`. Write the comments, the commits that applied them, the issues you split off, and whether there was nothing to fix.

## 6. Merge after CI passes

- Re-run the related tests against the last commit. If a new commit appears during review, do not merge on the earlier CI result; use the required CI result of the final head.
- **When all required CI checks pass, the agent (the main agent and local workers) merges the PR without asking the user.** Right before merging, check the PR head SHA and run `gh pr merge <url> --merge --match-head-commit <verified head SHA>` (a merge commit) with the project wrapper.
- After the merge, check that the linked issue (`Closes #N`) is closed, and report the issue URL, branch name, PR URL, merge commit SHA, verification results, and remaining work.
- Merge stacked PRs in order. After the earlier PR is merged, merge `origin/main` into the next PR's branch to resolve conflicts, re-run the related tests, push normally (no force push), check that CI passes, and merge. Repeat to the end of the stack.
- **Forbidden:** merging while a check has failed or is still running, bypassing branch protection with `--admin` or the like, replacing review by approving your own PR, committing or pushing directly to `main`, and force pushes. If you cannot get CI to pass, leave the PR open and report the cause.
- Currently a merge to `main` does not trigger a deployment in this project (AWS deployment is not connected). When you connect deployment automation, add a step here that checks the deployment result after the merge.

## Authentication and failure handling

Do not needlessly re-check the issue, push, and PR permissions already granted. Respect the run permissions the tools require and the GitHub authentication. On failure, resume from the step you already completed, and if the result of a remote creation is unclear, look it up before you retry. Do not work around an account or authentication problem by creating things with another account.
