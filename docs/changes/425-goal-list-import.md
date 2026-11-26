# #425 Import an algorithm goal list from an Excel file

- Issue: [#425](https://github.com/sirloinbh/study-log/issues/425) (parent #423)
- Branch: `feat/425-goal-list-import`
- Sample file structure: comment on #424 (`문제목록` 500 rows, `추가문제` 201 rows, Baekjoon only, no target dates).

## User decisions (2026-11-26, relayed by the coordinator, recorded on the issue)

- Reader package: **exceljs@4.4.0** (option B).
- Progress columns: on the **first import only**, rows with `완료` = O and a `풀이 날짜` become solved attempts, `△` with a date partly solved attempts; X and rows without a date are skipped; `메모` is the attempt note. A re-import never adds attempts.

## Changes

- Migration `036_coding_goals.sql`: `coding_goal_lists` (unique name, optional target date) and `coding_goal_items` (list, site, problem key, title, stage, topic, solved.ac level, optional target date, position). Items name their problem by site and key like `coding_problems`, without a foreign key.
- `backend/src/coding-goal-import.ts` (pure): header guessing (Korean and English names), tier parsing (`브론즈 5` is level 1, `골드 3` is 13), link and date parsing, row mapping. Bad rows are listed with their sheet row and the reason; a repeated problem keeps its first row.
- `backend/src/coding-goal-xlsx.ts`: the exceljs reader (dates become `YYYY-MM-DD`, formulas give their result, empty rows keep their number).
- `backend/src/coding-goals.ts`: `POST /api/coding/goals/inspect` (sheets, headers, preview, guessed columns), `POST /api/coding/goals/import` (multipart; `dryRun` shows the plan, otherwise it imports), `GET /api/coding/goals`, `GET /api/coding/goals/:id`, `DELETE /api/coding/goals/:id`. A list of the same name is updated: items match by site and key, a changed item is updated, an unchanged one is left alone, and a problem missing from the file stays. One audit row per import with counts only. Limits: 2 MB, 2,000 rows (400 for more).
- Frontend `coding-goals.tsx`: the Goal lists card on the Coding screen: file, sheet, list name, site, optional whole-list target date, a dropdown per column (guessed, fixable), a preview (counts, problems already logged, skipped rows with reasons), Import, and the list of goal lists with Delete. Changing any choice clears the preview, so Import always matches what was previewed. Messages share the status line at the top of the screen.
- `docs/openapi.json` regenerated.

## Package review (exceljs@4.4.0, `npm install --ignore-scripts --save-exact exceljs@4.4.0 -w backend`)

- MIT, 21.8 MB unpacked, last release 2024-12-20 (stable, not recent). Maintainers guyonroche and siemienik.
- No `preinstall`/`install`/`postinstall` script in it or in the 172 lock entries it added; every `resolved` URL is registry.npmjs.org. The install used `--ignore-scripts`.
- `npm audit` reports 2 moderate findings in its nested `uuid` (<11.1.1, a bounds check when a caller passes its own output buffer). exceljs only calls `uuid` without that argument, and the audit's suggested fix is a downgrade to exceljs 3.4.0, so it is left as is.
- Size cost: the backend only; the frontend bundle is unchanged. Other lanes run `npm ci` after this merges.
- Chosen over `read-excel-file` (smaller but single-maintainer and very new releases) by the user.

## Tests

- Backend unit: header guessing (sample file and its extra sheet), tiers, links, dates, statuses, row mapping and skip reasons, the attempt rule; route checks (no file, not an xlsx, over 2 MB, bad fields, missing column choice, sheet over 2,000 rows).
- Backend reader: a workbook built with exceljs is read back (numbers, dates, rich text, formulas, gaps) and mapped like the sample.
- Backend integration (needs a database): preview, first import (items, linked problem, attempts from O and △), re-import changes nothing and adds no attempts, a changed title and a missing problem, audit rows, delete.
- Frontend: the card guesses the sheet and columns, preview then import sends the same choices, fixing a column clears the preview, a file over 2 MB is refused, delete after confirming.
- e2e `e2e/coding-goals.spec.ts` with `e2e/fixtures/coding-goals.xlsx` at 390x844: import, repeat, delete, no sideways scroll.

## Not in this card

Goal progress (solved, late, filters, the page per list) is #426. The quick log does not offer goal items yet; #426 adds them.
