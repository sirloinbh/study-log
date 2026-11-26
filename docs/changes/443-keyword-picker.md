# 443: Pick a keyword already used instead of typing it

## What changed

- `backend/src/keywords.ts`: new `GET /api/keywords/used` returns `{ keywords: string[] }`, the distinct keywords already used (any case counts as one, the most recently used spelling and order first, at most 200). It is registered above `/:id`. `backend/src/openapi.ts` and `docs/openapi.json` list it (there is no `docs/api.md`; the API reference is the OpenAPI file).
- `frontend/src/keywords.tsx`, `keyword-form.tsx`: the keyword field in both the add form and the edit form is the shared `Combobox` with the used keywords as suggestions. Typing filters the list, and a keyword that is not in it can still be typed and added. The list is reloaded after every change. The label sits beside the field (`.combo-field`) so an open list does not change the label's name (same as #422).
- Tests: a unit test for the route, an integration test (one entry per keyword whatever the case, newest first; runs in CI, no local DB), and a frontend test for picking and for adding a new keyword.

## Browser check (Vite dev server, mocked `/api`, Chrome)

- 390x844 and 1440x900: typing "eig" lists the two matching keywords (32px rows), no sideways overflow.
