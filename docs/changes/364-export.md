# Export study logs, exercises and retrospectives (#364)

## What changed

- `GET /api/export/study-logs.csv`, `/exercises.md`, `/retrospectives.md` with optional `from` and `to` (both ends included; invalid or reversed ranges are a 400). Study logs are filtered by study date, exercises by the day they were added (Asia/Seoul), retrospectives by the start of their period. Files are sent as attachments (`study-logs-<today>.csv` etc.), `private, no-store`, `nosniff`.
- CSV: UTF-8 with a byte order mark (Excel reads Korean), CRLF rows, cells with comma, quote or line break quoted, quotes doubled. A cell that a spreadsheet would read as a formula (starts with `=`, `+`, `@`, or `-` not followed by a space) gets a leading apostrophe; Markdown list dashes (`- item`) are left alone.
- Markdown: exercises grouped by textbook and chapter with their answers; retrospectives per period.
- Settings page: "Export your data" with a date range and three download links.
- Tests: `export.test.ts` (escaping, BOM, line breaks, headers, range, validation), `export.integration.test.ts` (real tables; runs in CI only), `data-export.test.tsx`.

## Notes

- Reads are not audited (only changes are, #263).
- The SQL was not run locally (no database here); the integration test covers it in CI.

## Checked

- `npm run check`, `node .standards/check.mjs`; browser at 390x844 and 1440x900 (mocked API): range typed, a download starts, buttons fit the card, no overflow.

## Also in this PR

- Renumbered `027_keyword_cards.sql` to `028_keyword_cards.sql`: it and lane-3's `027_weekly_goals.sql` were merged to main at the same time and `db:migrate` refused two files with number 027 (main CI was red). Both files are idempotent, so re-running under the new name is safe.
