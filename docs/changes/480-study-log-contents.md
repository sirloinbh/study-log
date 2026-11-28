# #480 Record the chapters and sections finished in each study log

- Issue: [#480](https://github.com/sirloinbh/study-log/issues/480) (parent #469)
- Branch: `feat/480-study-log-contents`

## Purpose

A study log records which chapters and sections of its textbook were finished, and the API counts them per day, week and month.

## Choice for implementation

`study_logs.content_id` stays as the one linked entry ("studied") and its form field is unchanged. The new table holds what was **finished**. Migration `042_study_log_contents.sql` copies each existing log's `content_id` into the new table, so old logs count their linked entry as one finished entry, as the card says. New logs finish only what is ticked in the new checklist; their `content_id` does not count by itself.

## Changes

- `database/migrations/042_study_log_contents.sql`: `study_log_contents(study_log_id, textbook_id, content_id)`, primary key `(study_log_id, content_id)`, composite foreign key `(textbook_id, content_id)` to `textbook_contents` (so an entry must belong to the log's textbook; `RESTRICT` on delete, like `content_id`), `ON DELETE CASCADE` from the log, and the backfill above. Safe to re-run.
- `backend/src/study-logs.ts`: POST and PUT accept `finishedContentIds` (integers, at most 500, duplicates dropped; needs a textbook). The ids are rewritten as a whole in the log's transaction. Responses carry `finishedContentIds`. A foreign-key failure answers "Contents entry not found".
- `backend/src/stats.ts`: new `GET /api/stats/finished-contents?period=week|month|3months|all&textbookId=`. A top-level entry is a chapter; any entry below one is a section. An entry counts once, on the date of the first `done` log that finished it, not after today (same rules as the chapter count in `/api/stats/textbooks`). Returns the totals of the book(s), counts in the period and cumulative, today's counts, `daily`, `weekly` (by Sunday) and `monthly`. Unknown textbook: 404.
- `backend/src/openapi.ts`, `docs/openapi.json`: the new endpoint.
- `frontend`: the form shows a "Finished chapters and sections" checklist (sections indented) once a textbook with contents is chosen; picking another textbook clears the ticks; editing a log loads them.
- Tests: unit tests for the validation and the day and week bucketing; an integration test (`study-log-contents.integration.test.ts`) for saving, replacing, refusing another textbook's entry, counting once, planned and future logs, per-textbook counts and delete protection; a frontend test for picking, saving and reloading several entries.

## Not changed

The CSV export has no finished-entries column and the textbook statistics still use `content_id`; #481 moves the screens to the new endpoint.
