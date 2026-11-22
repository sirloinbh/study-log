# 287: Move more screens to the shared query layer

## What changed

Moved to `useApiQuery` / `useApiMutation` (one commit per screen), dropping their `useEffect` load loops, per-key state maps, request counters and `current` guards:

- `heatmap`, `textbook-stats`, `stats` (study time and the textbook list), `review-badge`, `retrospectives` (period, recent list, save, delete) and `reviews` (list, complete, postpone, change date).
- Query keys carry what the old code tagged its state with (period, pick, range), so a slow answer for another pick still cannot replace or hide the one shown.
- `retrospectives` and `reviews` keep their "busy until the reload is back" behavior: after a change the period or list is invalidated and awaited before the controls come back; the saved text is put in the cache at once (`setQueryData`).
- `reviews` uses `staleTime: 0` so picking a range reads it again as before, and hides the list error while a retry is in flight so the same error coming back is announced again.
- `review-badge` keeps the last count (a ref) while a new count loads or fails; each trigger (page change, change report, day, tab return) is its own key.

## Tests

- Test files that render these screens import `render` from `./test/render` (import line only).
- `reviews.test.tsx`: "returning to the tab while a change runs adds no request" now waits for the held change's request first. The mutation starts one tick later than the old direct `requestJson`, so the request count was taken a moment too early; the assertion is unchanged.

## Not moved yet

- Calendar and study-log search (children of the study log page), schedules, exercises, study logs, keywords, textbook contents and textbooks: lane-4's #276 is changing them; they move after it merges. `important-exercises`, `exercise-translation` and `exercise-extraction` sit under those screens and move with them.
- `sign-in` and the health check are managed files.

## Checked

- `npm test -w frontend` passes; `npm run check`: see the PR.
