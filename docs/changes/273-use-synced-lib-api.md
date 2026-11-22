# 273: Switch screens to the synced lib/api.ts and delete the fork

## What changed

- All 19 screens import `./lib/api` (the centrally synced client). `frontend/src/api.ts`, the local fork, is deleted, so there is one `RequestError` and one request helper, and `lib/api.test.ts` now covers code the app runs.
- `lib/api.ts` already has `requestForm` and the non-JSON 2xx check (the project-standards item this card waited for), so no managed file changed.
- `requestForm` in the synced client does not add the app's own request marker, so `exercise-extraction.tsx` passes `headers: { 'x-requested-with': 'study-log' }` itself. The API refuses file requests without it (`backend/src/exercises.ts`, `exercise-files.ts`); the extraction test asserts the header.

## Behavior differences of the synced client

- A request times out after 30 s (`RequestError` kind `timeout`).
- A 2xx answer with a non-JSON body rejects (kind `body`) instead of resolving with `{}`.
- Errors carry `kind`, `fields` and `name`; a 401 calls the registered `onUnauthorized` handler (none registered yet).

## Checked

- `rg "from './api'" frontend/src` finds only `lib/api.test.ts` (a managed file that tests `lib/api.ts` itself); no screen imports the fork.
- `npm test -w frontend`: 65 files, 510 passed, 3 skipped. `npm run check`: see the PR.
