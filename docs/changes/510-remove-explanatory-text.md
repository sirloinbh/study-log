# #510 Remove explanatory, example and motivational text

- Issue: [#510](https://github.com/sirloinbh/study-log/issues/510) (tracking: sirloinbh/project-standards#1216; rule: design-system `docs/guidelines.md`, "Screen text rule")

## Changes — 2026-11-29

Search used: `description=`, `e\.g\.`, `placeholder=`, `className="hint`, `className="status"` paragraphs in `frontend/src` (not tests, not the UI kit).

Removed:

- Page descriptions on every page (Study log, History, Schedules, Reviews, Textbooks, Algorithms, Dashboard, Retrospectives, Settings); `Page` no longer takes `description`.
- Intro paragraphs: Google Calendar sync, Goal lists (Excel import), Export your data, the contents paste help, the answers-import note, the Markdown hint under the memo, the "Delayed means ..." sentence in the review rate summary.
- Example and hint placeholders: `e.g. Python`, problem ID examples per site (`keyHint`), `e.g. 1.2`, `e.g. 3`, the schedule name example, the retrospective prompt, `Title, number or link`, `Part of a memo`, the textbook URL example.
- Encouragement: ` · study today to keep it` next to the study streak.
- `No problems yet. Type a number or a link` is now `No problems to pick from yet`.

Kept: labels, error and validation messages, empty-state titles, status text, confirm-dialog consequence text, the AI translation caution.

Tests: `study-goal.test.tsx` and `study-logs.test.tsx` now check the removed text is gone.
