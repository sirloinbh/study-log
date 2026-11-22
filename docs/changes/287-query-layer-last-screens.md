# 287: Move the last screens to the shared query layer

## What changed

One commit per screen group, same pattern as the earlier batches (`287-query-layer-first-screens.md`, `287-query-layer-more-screens.md`): `useApiQuery` with keys that carry what the old code tagged its state with, `useApiMutation` with `mutateAsync` inside the existing busy flow, `invalidateQueries` before the controls come back, `setQueryData` where the saved value shows at once. The `useEffect` load loops, per-key state maps, request counters and `current` guards are gone.

- `textbooks`, `textbook-contents`.
- `exercises`, `important-exercises`, `exercise-translation`, `exercise-extraction` (the file read stays a direct `requestForm` with the `x-requested-with` header; the save is a mutation), `use-exercise-data`, `use-answer-panel`.
- `keywords`: the day list and the writes. The search stays a direct `requestJson`: as a query it changed what the "a failed search is not brought back by a later change" test counts (the result was collected before the observer mounted), and that assertion matters.
- `schedules`, `schedule-create-form`: list and detail per schedule id; the reload after a change runs from an effect once the change has rendered.
- `study-logs` (recent list, save, delete), `calendar` (month and day keys, invalidated when `reloadKey` changes), `study-log-search` (a query keyed by the submitted request, enabled once something is submitted; a ref keeps the previous results on screen until the new answer arrives).
- Shared keys: `apiKey('/api/textbooks')` and `apiKey('/api/textbooks', id, 'contents')` are read by several screens, so a textbook list loaded once serves all of them for 30 s.

## Tests

- All screen test files render through `test/render.tsx` (a fresh client per render). Only `schedules.test.tsx` changed beyond that: its `bookServer` fake now answers the list and detail with the created schedule after a create, as a real server would (the old timing hid that the reload returned an empty list).

## Left as is

- `frontend/src/health.ts` and `sign-in.tsx` (managed files) keep their own requests.
- A handful of effects that react to `reloadKey` or a changed tree disable `react-hooks/exhaustive-deps` on purpose (they must not run on the first render).

## Checked

- `npm test -w frontend` passed 3 runs in a row (71 files, 532 passed, 3 skipped); typecheck, eslint and prettier are clean. `npm run check` and CI (including e2e): see the PR.
- Not done: a real-browser look at 390x844 and 1440x900 (`.claude/rules/frontend.md`); the CI Playwright e2e covers the main flows.
