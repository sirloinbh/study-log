# #146 Fix compose so a failed deployment goes back to the previous version

- Issue: [#146](https://github.com/sirloinbh/study-log/issues/146)
- Branch: `fix/146-compose-rollback`

## Purpose

The centrally managed file `deploy/remote-deploy.sh` assumes that `compose.yaml` tags the images as `study-backend:${IMAGE_TAG}` and `study-frontend:${IMAGE_TAG}` and publishes the web port as `${WEB_BIND}:${WEB_PORT}`. Now `compose.yaml` has no `image:` and the port is fixed as `127.0.0.1:8102:80`, so after a failed healthcheck, `start "$current"` or `rollback` could bring up the image that was just built again. There was also the problem that if you change `WEB_PORT` in the server `.env`, the healthcheck would look at a different port.

## Changes

- `compose.yaml`: put `image: study-backend:${IMAGE_TAG:-local}` on `api` and `image: study-frontend:${IMAGE_TAG:-local}` on `web`. I changed the web port to `'${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8102}:80'`. It is the same as the conditions in the central deployment runbook (`project-standards/docs/runbooks/deploy.md`, chapter 4) and the same format as `workout-memo` and `plan-routine`, which use the same standard.
- `.env.example`: wrote `WEB_BIND=127.0.0.1` and `WEB_PORT=8102`. I did not write `IMAGE_TAG`, because the deployment script sets it from the commit.
- `docs/next-steps/README.md`: since Docker runs, I removed the SVM item and reflected the remaining user step (the app DB password) and the finished #146.

`deploy/backup.sh` and `deploy/report.sh` use the already set `IMAGE_TAG`, and if there is none, they run compose with the `.deployed` value or `none`, and they use only the service name `db` and `docker compose ps -q`. They do not collide with the new image names, so there was nothing to fix. The default of `${IMAGE_TAG:-local}` is not used on the server, and is for when you run `docker compose` locally without `IMAGE_TAG`.

## Verification

On Docker Desktop (Client 29.9.2), I checked with a temporary compose project `-p study146` so it would not mix with the real app volume. For `NODE_AUTH_TOKEN` of the image build, I passed `gh auth token` (`read:packages`) of the `sirloinbh` account only as a shell environment variable. After the check, I deleted the containers, volumes, and images.

- `IMAGE_TAG=t1 docker compose -p study146 build`: built, tagged as `study-backend:t1` and `study-frontend:t1`.
- Imitating a failed deployment: based on `t1`, I made `study-backend:t2`, which exits right after starting, and `study-frontend:t2`, which differs only by a label. Following the order of `remote-deploy.sh`, I ran deploy `t1` -> deploy `t2` -> `start t1` (leaving out the git checkout step).
  - `t1`: `/api/health` passed, and the `api` and `web` containers came up with the `t1` image IDs.
  - `t2`: the healthcheck failed (the intended result), and the containers changed to the `t2` image IDs.
  - Restarting with `IMAGE_TAG=t1`: the healthcheck passed, and the containers came up again with the `t1` image IDs (`d3b15dcece8b`, `c0e693f39536`). The `compose.yaml` before the fix has no `image:` and does not use `IMAGE_TAG`, so at this step the image built last comes up again (confirmed in code, and I did not run the state before the fix).
- `WEB_PORT=8199 IMAGE_TAG=t1 docker compose -p study146 up -d`: the web was published as `127.0.0.1:8199->80/tcp`, and `http://127.0.0.1:8199/api/health` passed.
- The same migration command as the deployment, `docker compose run --rm --no-deps -v .../database/migrations:/database/migrations:ro api node dist/migrate.js`: it applied 001 to 018, and running again gave "적용할 마이그레이션이 없습니다." ("There are no migrations to apply."). It is a step that I could not check in #134 because there was no Docker. In Git Bash, because of path conversion, it first gave `ENOENT ... /database/migrations/`, and it passed when I ran it with `MSYS_NO_PATHCONV=1` and `$(pwd -W)`. It does not apply on the server (Linux).
- Without `IMAGE_TAG`, `docker compose exec -T db sh -c 'pg_dump ...'` works, and `docker compose config --images` shows `study-backend:local` and `study-frontend:local` (the premise of `deploy/backup.sh`).
- `npm run standards:check`: passed. 1 warning (the array length limit at `backend/src/holidays.ts:48`, `GHSA-mrhx-c7xc-m3w5`) is an existing item unrelated to this change, and it is in the next task candidates.
- `npm run check`: passed (exit 0). Of 321 backend tests, 289 passed, 0 failed, 32 skipped. The 32 skipped are DB integration tests left out because this shell has no `TEST_DATABASE_URL`, and this change does not change app code.

## Limits and follow-up

- The images the old compose made with default names (`study-log-api`, `study-log-web`) are not in the cleanup targets of the deployment script (`study-backend`, `study-frontend`). If a server deployed before this change exists, delete them by hand once. There is no deployed server now.

- The real production server deployment is not connected, so I did not check on a server.
- I have not created the local app DB yet because the password in `.env` is an example value. Bring it up after the user sets the password (`docs/next-steps/README.md`).

## Review

The first review found no defects that block the merge. It confirmed that the image names, the build, migration, and cleanup steps, the healthcheck port, `backup.sh` and `report.sh`, the port check of `.standards/check.mjs`, and the local development procedure all match the new compose. I fixed the following document comments in this PR.

- `deploy/report.sh` was missing from the premise check, and the explanation of the use of the `IMAGE_TAG` default was not accurate. I fixed both.
- I wrote in the limits that the old default-name images are not in the server's cleanup targets.
- I changed the wording "if there is no Docker" left in `docs/next-steps/README.md` to be about the app DB.
- I did not fix the comment that if you copy `WEB_BIND=127.0.0.1` in `.env.example` to the server as it is, the healthcheck passes but outside access does not work, because the comment has a `0.0.0.0` note and by the runbook the server user-data puts in the value.

The second review also found no defects that block the merge. I confirmed that the three first-round comments were applied, and I fixed two remaining wordings. The review is limited to 2 rounds, so I did not do a third review.

- I changed "even without Docker" on line 10 of `docs/next-steps/README.md` to be about the app DB.
- I corrected that `backup.sh` and `report.sh` use the already set `IMAGE_TAG` first, and fill in `.deployed` or `none` only when it is absent.
