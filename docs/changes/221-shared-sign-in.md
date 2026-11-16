# #221 Require the shared sign-in

- Issue: [#221](https://github.com/sirloinbh/study-log/issues/221)
- Branch: `chore/standards-sync-b3f43a7`

## Change

- `backend/src/app.ts`: `createApp` takes an `auth` middleware and mounts it on `/api` after the body parser and before any route; `/api/health` stays open (the middleware's `publicPaths`). The rate limit stays first, so refused requests cost as little as possible. New `GET /api/me` returns the signed-in user.
- `backend/src/server.ts`: passes `sharedAuth()` (managed `backend/src/standard/auth.ts`), which builds the middleware from `@sirloinbh/auth-client` when `AUTH_INTERNAL_URL` is set and refuses to start in production without it.
- `compose.yaml`: the API joins the external `shared-auth` network and checks sessions at `http://shared-auth-api:3110`.
- `frontend/src/app.tsx`: the app is wrapped in `SignInGate`, and the top bar shows `AccountActions` next to the review badge. On `<app>.<domain>` a signed-out visitor goes to `https://auth.<domain>/sign-in`. On localhost and IP addresses nothing changes.
- `backend/test/sign-in.test.ts`, `backend/test/helpers.ts`: tests with a fake auth service; `withApi` accepts an `auth` option.

## Reason

- The app had no login and relied only on the IP allow list. The shared sign-in is live (sirloinbh/project-standards ADR-0015, #550, #551); workout-memo was the pilot (#303).

## Notes

- This app has no OpenAPI contract and no API reference doc, so there is no `/api/me` row to add. The sign-in rule is recorded here and in `backend/src/standard/auth.ts`.
- `/api/health` stays public, so `deploy/notify.sh` and `remote-deploy.sh` health checks keep working.

## Verification

- Local: format, lint and typecheck pass; backend `sign-in`, `health` and `rate-limit` tests (11 pass); frontend `app` and `auth-origin` tests (7 pass); `node .standards/check.mjs` passes. The tests that need PostgreSQL and the rest of the frontend run in CI.
- `npm install --ignore-scripts` (user step) and `node .standards/lockfiles.mjs --write` updated the lockfiles for `@sirloinbh/auth-client` 1.0.0.
