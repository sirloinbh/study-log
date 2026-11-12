---
name: study-log-testing
description: Write or update behavior-focused tests with study-log implementations and fixes, run them before commits and PR creation or updates, and record actual results. Use with study-log-implementation; for documentation-only changes validate the changed artifacts instead of adding unrelated app tests.
---

# Study Log test writing and running

Follow the project's AGENTS.md and the study-log-implementation procedure together. This skill sets the standard for writing and running tests; it keeps the issue, branch, docs, and PR steps, the automated code review after the PR (at most 2 rounds), and the merge-after-CI policy.

## Write tests together with the implementation or fix

- When you implement a feature or change behavior, add or update test code that verifies that requirement, and include the implementation and the tests in the same work commit. Running the existing tests does not replace verifying the new feature.
- For a bug fix, add a regression test that catches the bug coming back. If possible, confirm it fails before the fix and passes after; if you cannot reproduce the bug, record that limit.
- For a refactor, verify that existing behavior is preserved. If the related tests are enough you can keep them as they are, but add the scenarios that are missing.
- Verify results the user can see and domain rules, rather than tests that repeat the internal implementation. Choose the normal path plus the input errors, boundaries, and failure paths that relate to the change.
- Use unit tests for business logic, integration tests for the API, DB saves, and transactions, and component or browser tests for screen input and save flows. Do not add every kind of test to every change.
- Check the installed test tools and commands in `package.json`. The frontend uses Vitest and Testing Library (`*.test.tsx` next to the target), and the backend uses `node:test` (`backend/test/*.test.ts`). Do not report as if you used a tool that is not installed, such as Playwright.
- Keep test data separate from production and user data. Write checks that depend on time, dates, or random values so they verify the same meaning when the run environment changes.

## Before committing

- Check the changes and tests in the final commit and actually run the related tests. Include the implementation, tests, and docs record in the same commit.
- Record the test code paths, the behavior verified, and the commands and results in the matching issue record in docs/changes.
- Do not make a failing test pass by skipping or deleting it or by weakening an assertion. Fix the failure, then commit.
- If you cannot prepare the needed run environment, record that you did not run it. Do not report unverified implementation as done, and hand over a PR with remaining verification as a draft.

## Before creating or updating a PR

- Run the related tests and the project's required checks on the final diff and confirm they pass. If nothing changed after the commit and the result for the same target is still valid, you do not need to repeat the same check.
- Record in the PR the tests you added or changed, the commands, pass/fail/skip, and the reason for anything not run. Do not count an integration test skipped because the DB environment variable is not set as a success.
- If you fix code or tests after the PR, re-run the affected checks and update the docs and PR results. Fix CI failures too.
- If only docs, skills, or formatting changed and app behavior did not change, verify with the validator, format, and link checks for those artifacts and state why you did not add app tests. A behavior change in executable code or check scripts includes related tests or an execution check.
- Include the related tests in follow-up commits that address automated code review comments too, and re-run the related tests against the last commit.
- Do not merge the PR before all required CI checks pass. If a check fails or is still running, fix the cause and check again.
