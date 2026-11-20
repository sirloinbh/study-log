# #894 API healthcheck in compose.yaml

## Change

- `compose.yaml`: the `api` service gets the standard healthcheck (`node -e` fetch of `http://127.0.0.1:3102/api/health`, 5 s interval, 15 retries, 10 s start period), copied from the central scaffold with this app's API port.
- `web` waits for it with `depends_on: api: condition: service_healthy`.

## Reason

`docker compose up -d --wait` could not tell when the API was ready, and `standards-check` warned about the missing healthcheck (project-standards#894, #875).

## Verification

- `npm run check`.
- After the merge: the deploy finished, deployed commit = main, `/api/health` 200 through the proxy.
