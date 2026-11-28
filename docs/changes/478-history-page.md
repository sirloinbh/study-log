# 478: Move Recent logs, Study log search and the calendar to a History page

Part of epic #468.

## What changed

- New History page at `/history`, menu item "History" right after "Study log". It holds Recent logs (with edit and delete), `StudyLogSearch` and `Calendar`. The code is `frontend/src/study-history.tsx`.
- The Study log page (`study-logs.tsx`) is the entry form only. The list, search and calendar are gone from it.
- Editing: the Edit button on a recent log opens `/?edit=<id>`. The Study log page reads the log by `GET /api/study-logs/:id` (no backend change) and fills the form. Saving or cancelling the edit goes back to `/history`. A log that can no longer be loaded shows an error on the form. Routing glue is in `frontend/src/study-log-pages.tsx` so `StudyLogs` and `StudyHistory` stay router-free.
- The reload coupling (`reloadKey`) between the list, search and calendar is kept on the History page: a delete there reloads all three. A save on the Study log page invalidates the cached list, and the calendar and search read again when History opens.
- Choice for implementation (card): History is a new page; Week and 12 weeks are not merged into it.

## Behavior notes

- A delete moved with the list. Deleting no longer ends an edit in progress, because the form is on another page.
- The page description of Study log no longer mentions recent logs.

## Tests

- `study-logs.test.tsx`, `study-logs-change.test.tsx`, `study-logs-type.test.tsx`, `screens.test.tsx`, `calendar.test.tsx`, `study-log-search.test.tsx`, `focus-a11y.test.tsx`, `loading.test.tsx` render `test/study-log-screen.tsx`, which wires the two pages like the routes do. Edit now waits for the log to load. Tests of "delete the log being edited" and "404 deleting another log while editing" lost their edit half (the two cannot coexist now); "saving reloads the calendar/search" became "deleting reloads the calendar/search".
- `app.test.tsx`: menu order with History, and the full path History → Edit → form filled → save → back to History.
- `screens.test.tsx`: the Study log page shows no list and makes no `/api/coding` request.
