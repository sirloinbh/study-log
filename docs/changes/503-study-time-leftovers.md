# #503 Reword study-time text and remove unused study-time endpoints

- Issue: [#503](https://github.com/sirloinbh/study-log/issues/503) (parent #469)
- Branch: `chore/503-study-time-leftovers`

## Purpose

After #481 the screens count finished chapters and sections. Leftover wording and two endpoints that nothing reads are cleaned up.

## Readers checked before removing the endpoints

`GET /api/stats/study-time` and `GET /api/stats/heatmap` had no reader except their own tests and the OpenAPI table:

- frontend: no screen calls them since #481 (only a path helper and types, removed here);
- e2e: no call;
- `backend/src/ai-tools.ts`: the only tool is `list_study_logs` (read by shared-ai over `/internal/tools`);
- backups and docs: no reference besides `docs/openapi.json` (generated).

Kept because they are still read: the daily goal endpoints, `/api/stats/patterns`, `/api/stats/reviews`, `/api/stats/textbooks`, `/api/stats/finished-contents` and `/api/stats/finished-days`.

## Changes

- Backend: both routes, `studyTimeQuery`, the daily-minutes and bucket helpers, and their OpenAPI entries are removed. `counted` stays (the daily goal uses it). `backend/test/stats.integration.test.ts` tested only these endpoints and is removed. Unit tests that used `study-time` now use `finished-contents` for the same checks (English 400 for an unknown period, zero counts without entries, one REPEATABLE READ snapshot).
- Frontend: the helpers only the old screens used are removed (`studyTimePath`, `StudyTimeStats`, the study type labels, the minute heat bands, `chartBars`, `busiestBar`, `chapterPercent`, `weekTotals`) with their tests.
- Text: the Dashboard subtitle and the 12 weeks subtitle name chapters and sections; `docs/decisions/review-rules.md` no longer describes a study type filter on the statistics screen. Where time is still shown on purpose, wording stays: the daily goal card, the study pattern, the study log form's session length and the retrospective summary.
