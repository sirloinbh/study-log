# 287: Move the first screens to the shared query layer

## What changed

- `App` now provides one `QueryClient` (`createQueryClient()` from the synced `lib/query.ts`) through `QueryClientProvider`; the old `App` body is renamed `AppBody` and left as it was, so the diff in `app.tsx` is small.
- `ReviewRateChart` and `StudyPattern` load through `useApiQuery` and drop their `useEffect` loops, the per-period `useState` maps and the `current` guards: the query key (`apiKey(path, period)` or `apiKey(path, from, to, reloadKey)`) keeps one cached answer per request, so a slow answer for another period still cannot replace this one.
- New test helper `frontend/src/test/render.tsx`: a `render` that wraps the screen in a fresh `QueryClientProvider` (no retry, always stale, no cache time) so one test's cache never answers the next one. The test files that render these screens import it instead of the Testing Library `render` (import line only).

## Behavior

- A revisited screen shows cached data at once and refreshes in the background after 30 s; a window that regains focus refetches stale data. A failed load is retried once (network, timeout or 5xx).
- Error and loading text are unchanged.

## Still to move

Screens with writes or parent trees that tests render without a provider move after lane-4's #281 lands (heatmap, textbook-stats, stats, study-log-search, calendar, reviews, schedules, textbooks, textbook-contents, exercises, important-exercises, exercise-translation, study-logs, keywords, retrospectives).

## Checked

- `npm test -w frontend`: all pass (stats, app, retrospectives, latest-request, study-pattern re-run). `npm run check`: see the PR.
