# Initial development environment setup (before the issues)

- Date: 2026-10-19 (Asia/Seoul)
- Baseline: workout-memo's [development environment setup document](../project-setup.md) (workout-memo PR #57)

## Purpose

Prepare the development environment, the minimum app, verification, and repositories so the study-log project can be developed issue by issue. Detailed features go ahead after the user registers issue cards.

## Contents

- Stack: React 19 + Vite + TypeScript, Express 5 + pg + Zod, PostgreSQL 17, npm workspaces, Docker Compose, GitHub Actions. Node 24.21.0 / npm 11.19.0.
- Dependencies: only the same packages and versions as workout-memo's lockfile (only the workspace names changed). With the user's approval, installed with `npm ci --ignore-scripts` and added no new packages. `npm audit`: 0 vulnerabilities.
- Minimum app: `GET /api/health` (DB check, service date), Korean 404 and 500 error handling, the sidebar, the page header, the status display, the empty state screen, and design tokens based on CSS variables.
- DB: `database/migrations/001_initial.sql` (`app_settings`, safe to re-run). For applying to an existing DB, it describes only the `psql -f` method.
- Tests: unit (`health.test.ts`), DB integration (`db.integration.test.ts`, skipped without `TEST_DATABASE_URL`), UI (`app-ui.test.ts`, a vm harness), and the skill sync check.
- AI instructions: `AGENTS.md`, `CLAUDE.md`, and 3 skills (sources in `skills/`, copies in `.claude/skills/`).
- Repositories: the umbrella `sirloinbh/study-log` + the deployment sub-repositories `study-log-frontend`, `study-log-backend`, and `study-log-db` (private, subtree). AWS uses the shared `shared-aws-infrastructure`.

## Verification

- Applied the migrations as UTF-8 to the dedicated test DB `study_log_test` (workout-memo's test container) and ran `npm run check`: **exit 0**.
  - App and DB tests **8 pass / 0 fail / 0 skip** (the DB integration test actually ran)
  - Skill check **4 pass / 0 fail / 0 skip**
  - Format, lint, and types passed, and the frontend and backend builds passed
- In a real browser (Playwright, dev server + the dedicated test DB): no horizontal scroll at mobile 390px, status '서버 연결됨 · 2026-10-19' (UI text meaning "Server connected · 2026-10-19"), and the title and aria-current change when switching menus. The PC 1440px layout was normal.
- The initial commit was pushed directly to `main` to create the repositories. From then on, every change goes issue -> branch -> PR.
- The Docker image build is checked with the `docker-build` job in GitHub Actions. I did not run `docker compose up` locally.
