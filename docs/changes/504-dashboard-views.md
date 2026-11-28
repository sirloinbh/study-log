# #504 Merge Week and 12 weeks into Dashboard

- Issue: [#504](https://github.com/sirloinbh/study-log/issues/504) (parent #468; rule: project-standards#1215 / design-system#59)
- Branch: `feat/504-merge-views-into-dashboard`

## Purpose

The main menu has no Week or 12 weeks item. The Dashboard holds the Overview, the Week view and the 12 weeks view behind one choice.

## Changes

- `frontend/src/dashboard.tsx` (new): the shared `SegmentedControl` ("Dashboard view": Overview, Week, 12 weeks) above the chosen view. The choice lives in the address as `?view=week` or `?view=twelve-weeks`; no parameter, or an unknown one, opens the Overview.
- `frontend/src/app.tsx`: the Week and 12 weeks menu items, page addresses and pages are removed; `/week` and `/twelve-weeks` redirect (replace) to `/dashboard?view=week` and `/dashboard?view=twelve-weeks`; the Dashboard page renders `Dashboard` and its subtitle names all three views.
- Tests: `app.test.tsx` (menu has no Week or 12 weeks item, the redirects, the view switch and the address). No e2e spec clicked those menu items.

## Checks in a real browser

Vite dev server with the API mocked by route: `/week` opens `/dashboard?view=week` and the Week view; the choice switches to 12 weeks and back to the Overview and the address follows; the menu lists Study log, History, Schedules, Reviews, Textbooks, Algorithms, Retrospectives, Dashboard, Settings; no sideways scroll at 390x844 and 1440x900.
