# #898 Use listenHost in server.ts

## Change

- `backend/src/server.ts` listens on `listenHost(auth !== undefined)` from the managed `standard/auth.ts` instead of a literal `'0.0.0.0'`: all interfaces with the shared sign-in, `127.0.0.1` without it (`HOST` overrides).

## Reason

Without a sign-in (local run only; production refuses to start without `AUTH_INTERNAL_URL`) the open API was reachable from the network. Tracked in project-standards#898 (#866).

## Verification

- `npm run check`.
- After the merge: the deploy finished (compose sets `AUTH_INTERNAL_URL`, so the container still listens on 0.0.0.0), `/api/health` 200 through the proxy.
