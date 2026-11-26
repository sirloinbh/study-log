# 420 Open on the day log and use the shared menu order

## Purpose

User requirement (2026-11-26, central rule sirloinbh/project-standards#1128): the app opens on the day log and the menu runs day log, Week, 12 weeks, the other pages, Dashboard, Settings.

## Changes

- The day log (Study log) was already the start page at `/`; unknown addresses still redirect to it.
- New `/week` page: the seven days of a week (Sunday to Saturday, like the calendar and the heatmap) with the logs and the time of each day. Earlier weeks can be opened; there is no week after this one. It reads `GET /api/study-logs?from&to&limit=100`.
- New `/weeks` page: the last 12 weeks with the time studied, the study days and a bar for each, newest first. It reads `GET /api/stats/heatmap`, the same daily totals as the heatmap. No backend change.
- The Stats page is now the **Dashboard** at `/dashboard`; `/stats` redirects to it. The page content is unchanged.
- Menu order: Study log, Week, 12 weeks, Schedules, Reviews, Textbooks, Keywords, Flashcards, Wrong problems, Coding, Retrospectives, Dashboard, Settings. The desktop menu and the mobile sheet use the same list.
- Tests: `week-range.test.ts`, `week.test.tsx`, and the menu and redirect tests in `app.test.tsx`.

## Limits

- The Week page lists at most 100 logs per week (the API limit).
- The Dashboard is the existing Stats page renamed; a new dashboard design is not part of this card.
