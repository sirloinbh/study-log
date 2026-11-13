# Study Log

A personal service for recording what you studied and for how long, and for looking back at how your learning went. There is one user (the owner), and it runs locally without a login.

## Development baseline

Node.js **24.21.0**, npm **11.19.0**. If you use Volta, the pinned `volta` values in `package.json` apply automatically inside the repository. Install with `npm ci --ignore-scripts` (after the user confirms), format with `npm run format`, and run the full check with `npm run check`. The full baseline is in the [development setup document](docs/project-setup.md) and [AGENTS.md](AGENTS.md).

Changes go in this order: **GitHub issue -> issue-number branch -> implementation, tests, and docs record -> `npm run check` -> PR -> automated code review (at most 2 rounds) -> the agent merges after CI passes**.

## Run

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

Open http://localhost:8102 . Change the password in `.env` before you run it. Data is stored in the `study-log-data` volume, and `docker compose down -v` deletes the data.

Development run:

```powershell
docker compose up -d db
npm run dev
```

Vite http://localhost:5202, API http://localhost:3102/api/health, host DB port 15402.

## Verification

- `npm run check`: format, lint, types, tests, skill sync check, build.
- The DB integration tests need `TEST_DATABASE_URL` pointing to a dedicated test DB with the migrations applied. They are skipped if it is not set.
- GitHub Actions runs the full check with a PostgreSQL service and builds the Docker images.

## Repository layout

This repository is an umbrella monorepo that holds all the source. `frontend`, `backend`, and `database` are synced with `git subtree split` to the private deployment repositories `study-log-frontend`, `study-log-backend`, and `study-log-db` (`scripts/push-repositories.ps1`, only on request). The AWS infrastructure is managed in the shared repository `shared-aws-infrastructure`.

## Documents

- [AI instructions](AGENTS.md) · [Claude instructions](CLAUDE.md) · [DB](database/README.md)
- [Change records](docs/changes/README.md) · [Daily logs](docs/daily/README.md) · [Next steps](docs/next-steps/README.md)
