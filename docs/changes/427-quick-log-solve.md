# #427 Quick log of a solve on the Coding screen

- Issue: [#427](https://github.com/sirloinbh/study-log/issues/427) (parent #423)
- Branch: `feat/427-quick-log-solve`

## Purpose

Logging a solve on a known problem takes two taps on a phone: the problem, then Save.

## Changes

- `GET /api/coding/summary` (`backend/src/coding-summary.ts`): today's and this week's attempts, solves and minutes, the streak, and the language of the latest attempt. The week starts on Sunday like the other weekly figures. The streak counts days in a row ending today, or yesterday while today is still empty.
- `frontend/src/coding-quick-log.tsx`: the "Log a solve" card at the top of the Coding screen.
  - Problem picker: recent problems as buttons, narrowed by the search box. A Baekjoon number or a Baekjoon/LeetCode link that is not recorded yet shows a "New: ..." button; saving adds the problem (title from solved.ac, else made up from the slug) with the attempt in one request.
  - Result, language and minutes are segmented choices. The language used last is preselected; minutes are 10/20/30/45/60 or "No time".
  - Today, this week and the streak are shown above the picker.
- The status and error line moved to the top of the screen so a save shows its message next to the form.
- `coding.ts`: `parseNewProblem`, `fallbackTitle`, `languageChoices`, `minutePresets`.
- Choices are 48px high (`style.css`, `.coding-quick`).
- `docs/openapi.json` regenerated (there is no `docs/api.md`).

## Decisions

- Goal list items are not in the picker yet: the goal tables come with #425 and the picker gets them in #426.
- The existing "Add a problem" form stays for notes and study logs.

## Tests

- Backend: `streakOf` unit tests; an integration test for the summary (runs in CI, needs `TEST_DATABASE_URL`).
- Frontend: summary figures, a known problem logged with one pick and Save (last language used), result/language/minutes choices, a new Baekjoon number (solved.ac title) and a LeetCode link, a recorded number offering the recorded problem, parsing helpers.
- e2e: `e2e/coding-quick-log.spec.ts` at 390x844 with touch (two taps, no sideways scroll). Runs in CI only: no local test database.

## Verification

See the PR.
