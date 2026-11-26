# Open on the day log and use the shared menu order (#420)

## Purpose

The central menu rule (sirloinbh/project-standards#1128): the app opens on the day log and the menu runs day log, Week, 12 weeks, the other pages, Dashboard, Settings last.

## Changes

| File                                              | Change                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/app.tsx`                            | `nav` reordered; new `/week` and `/twelve-weeks` pages; the Stats page is now the Dashboard at `/dashboard`; `/stats` redirects to it. The day log was already `/`. |
| `frontend/src/week-view.tsx`, `week-data.ts`      | Week view: Sunday to Saturday, minutes per day and the sessions, with previous/this/next week. Reads `GET /api/study-logs?from&to`.                                 |
| `frontend/src/twelve-week-view.tsx`               | 12-week view: one row per week (minutes, days studied), from `GET /api/stats/heatmap`.                                                                              |
| `frontend/src/app.test.tsx`, `week-view.test.tsx` | Menu order, routes, redirect, the two views and their helpers.                                                                                                      |

No backend change: both views reuse existing endpoints.

## Decisions

- Week and 12-week views fit the app (study logs by day and week), so both were added.
- There was no Dashboard page; the existing Stats page is already described as the study time dashboard, so it was renamed and moved to `/dashboard` rather than adding a second summary page.
- The e2e smoke test opens `/` only, so no e2e change was needed.

## Verification

See the PR.
