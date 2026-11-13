# New web app project: development environment setup, a handover document for AI agents

This document is the instruction set to hand as it is to the **AI agent that will set up a new web app project** (Claude Code, Codex, and so on). It is based on the development environment actually run and verified in `sirloinbh/workout-memo`. The agent reads this document from start to finish, then proceeds in the order of [11. Bootstrap checklist](#11-bootstrap-checklist).

- Reference date: 2026-10-19 (Asia/Seoul). The version numbers are the values whose behavior was confirmed on that date. When you start a new project, check the official support status again, and record the reason if you change a version.
- Notation: **[Currently applied]** means installed and in use in workout-memo, and **[Recommended, not adopted]** means only reviewed and not installed yet. Do not treat a tool that is not adopted as if it were installed.

## 0. Values to confirm with the user before you start

The placeholders below differ for each project. If a value is not decided, **ask the user before you start the setup.** Do not pick one on your own.

| Placeholder               | Meaning                                                 | workout-memo example                                                                   |
| ------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `<app>`                   | App and repository base name (lowercase, hyphens)       | `workout-memo`                                                                         |
| `<App display name>`      | Name used on screens and in documents                   | `FORM · 나의 운동 기록` ("FORM · my workout log")                                      |
| `<owner>`                 | GitHub account (personal or organization)               | `sirloinbh`                                                                            |
| `<db>`                    | PostgreSQL DB and user name                             | `workout`                                                                              |
| `<web-port>`              | Production-style local web port (bound to 127.0.0.1)    | `8088` (avoids conflicts with common ports such as 8080)                               |
| `<db-port>`               | DB port you connect to from the host                    | `55432` (avoids a conflict with the default 5432)                                      |
| `<api-port>`              | API internal port                                       | `3001`                                                                                 |
| `<timezone>`              | Service reference time zone                             | `Asia/Seoul`                                                                           |
| `<region>`                | AWS region                                              | `ap-northeast-2` (Seoul)                                                               |
| `<budget-usd>`            | Monthly AWS budget alert threshold                      | `20`                                                                                   |
| Users and login           | Number of users, whether login is needed                | Single user, no login, so no public exposure                                           |
| Domain rules              | Core rules such as dates, units, and unconfirmed values | Dates `YYYY-MM-DD`, weight is total weight in kg, unconfirmed values are NULL          |
| GitHub account separation | Whether work and personal accounts are mixed            | The default `gh` is the work account, and this project uses a personal-account wrapper |

## 1. Absolute rules (constraints on agent behavior)

Copy them as they are into the new project's `AGENTS.md` too.

1. **Install or remove npm packages only after the user reconfirms.** The 2025 to 2026 npm supply chain attacks (the Shai-Hulud family) steal tokens through `postinstall` hooks. `npm install/i/add/uninstall/update/ci`, `npx <package>`, `pnpm/yarn/bun install`, and `corepack enable/prepare` all count. If an install is needed, follow this order.
   - Show the user the package list and the publisher, recent releases, and GitHub repository, and recommend checking socket.dev, Snyk Advisor, and deps.dev.
   - Run it when the user states explicitly "I understand the risk, go ahead". Suggest `--ignore-scripts` first.
   - Name in `allowScripts` in `package.json` only the packages whose build really needs an install script (for example `esbuild`).
   - Commands that do not install anything, such as `npm run <script>`, `npm ls`, and `npm view`, are allowed.
2. **After you open a PR, go through the automated code review at most twice, and the agent merges a PR whose required CI checks all pass.** If the review finds something to fix, apply it in an additional commit, and after the first fix get a second review once more. After the second fix commit, do no further review. If there is nothing to fix, go straight to the next step. Split fixes that are too large for this PR into new issue cards. The main agent and local workers do not ask; they run `pr merge <url> --merge --match-head-commit <verified head SHA>` (a merge commit) with the project wrapper and check that the linked issue is closed. Do not merge with a failed or running check, bypass branch protection with `--admin` or the like, replace review by approving your own PR, push or commit directly to `main`, or force-push. In a project where a `main` merge triggers a deployment, check the deployment result after the merge.
3. **Do not put secrets in the repository, documents, PRs, or logs.** This covers `.env`, tokens, real backups, and Terraform state. Commit only `.env.example`.
4. **Do not overwrite user changes.** Do not use `git add -A`; stage files by name. Check the target before you revert or delete.
5. **Do not report checks you did not run as passed.** Record skipped DB tests, browser checks not done, and things not deployed separately.
6. **If requirements are missing, ask.** Rules that must be decided before implementation (how to aggregate, policy, scope) are confirmed with the user together with a recommendation and recorded in the issue.

## 2. Language and document rules

- User conversation, screen text, and documents (README, docs, issues, PRs) are written in **English** (the user set this on 2026-11-12; the earlier version of this document said Korean). Code identifiers, commit title prefixes (`feat:` and so on), and code comments are English. Screen text and validation messages that the user sees are covered by `sirloinbh/project-standards#457`.
- Specify server validation error messages in Korean too if the user sees them. Give the message as in `.min(1, '…')` so the default English Zod message ("Array must contain…") is not shown on screen as it is.
- Dates are `YYYY-MM-DD`, and the service time zone is `<timezone>`. Compute the server's "today" in the service time zone, not the server's time zone.
- Document locations:
  - `docs/changes/<issue-number>-<slug>.md`: the change record per issue. Record the purpose, the changes, the actual verification commands with pass/fail/skip, and the limits.
  - `docs/daily/YYYY-MM-DD.md`: the summary of a work day. Accumulate by date and add it to the list in `docs/daily/README.md`.
  - `docs/next-steps/README.md`: the latest priorities, blockers, and next actions. Update it every day.

## 3. Tech stack

### 3.1 [Currently applied] Versions and roles

| Area            | Choice                                              | Version (pinned/range)                                     | Role                                                   |
| --------------- | --------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Runtime         | Node.js / npm                                       | `24.21.0` / `11.19.0` (pinned exactly)                     | Same for development, CI, and Docker                   |
| Package layout  | npm workspaces                                      | Root + `frontend`, `backend`                               | One root lockfile + lockfiles for the sub-repositories |
| Frontend        | React, React DOM                                    | `^19.1.0`                                                  | SPA                                                    |
|                 | Vite                                                | `^6.3.5`                                                   | Dev server and build, `/api` proxy                     |
|                 | TypeScript                                          | `^5.8.3`                                                   | `strict`                                               |
|                 | lucide-react                                        | `^0.468.0`                                                 | Icons                                                  |
| Backend         | Express                                             | `^5.1.0`                                                   | REST API                                               |
|                 | pg (node-postgres)                                  | `^8.16.0`                                                  | Hand-written SQL, no ORM                               |
|                 | Zod                                                 | `^3.25.0`                                                  | Server input validation                                |
|                 | tsx                                                 | `^4.19.0`                                                  | Dev run (`watch`) and test run                         |
| DB              | PostgreSQL                                          | `17` (`postgres:17-alpine`)                                | Single DB                                              |
| Web server      | nginx                                               | `1.27-alpine`                                              | Static files + `/api` reverse proxy                    |
| Code quality    | ESLint / typescript-eslint / react-hooks / Prettier | `10.12.0` / `8.71.2` / `7.1.1` / `3.9.10` (pinned exactly) | Warnings fail too                                      |
|                 | `@eslint/js`, `eslint-config-prettier`, `globals`   | `10.0.1`, `10.1.8`, `16.5.0`                               |                                                        |
| Dev convenience | concurrently                                        | `^9.2.0`                                                   | Run API and web together                               |
| Tests           | `node:test` + `tsx --test`                          | Built into Node                                            | Unit, DB integration, UI (chapter 6 below)             |
| Container       | Docker Compose                                      | n/a                                                        | 3 services: db, api, web                               |
| CI              | GitHub Actions                                      | n/a                                                        | Full check + DB integration + Docker build             |
| Infrastructure  | Terraform / AWS provider                            | `>= 1.6.0` / `~> 5.0`                                      | ECR and budget alerts (deployment not connected)       |

### 3.2 [Recommended, not adopted] Candidates to adopt when needed

| Area         | Candidate                                 | When to adopt                                                                                         |
| ------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Routing      | React Router                              | When there are more than 4 or 5 screens and you need shareable URLs and a back button                 |
| Server state | TanStack Query                            | When the code for fetching, caching, and refreshing after save keeps repeating                        |
| Forms        | React Hook Form + Zod                     | When array input and per-item errors get complicated                                                  |
| UI           | Tailwind CSS + shadcn/ui                  | When shared components grow. Move the existing design tokens first                                    |
| Charts       | Recharts                                  | When hand-drawn SVG charts are not enough                                                             |
| Tests        | Vitest, React Testing Library, Playwright | When you need automated browser regression. Do not overturn the existing `node:test` without a reason |
| API contract | OpenAPI                                   | When external clients appear                                                                          |
| ORM          | Prisma                                    | Only when the user asks to switch to an ORM. Do not split the migration source in two                 |

If you want to use the candidates above from the start in a new project, adopt them after getting the user's confirmation as rule 1 of chapter 1 says. When you adopt one, align the run commands, CI, and docs in the same PR.

## 4. Repository structure and splitting repositories

### 4.1 Umbrella monorepo + deployment sub-repositories

- Develop all the source in **one umbrella monorepo `<owner>/<app>`.** Issues, branches, PRs, and reviews all happen here.
- Sync the four area repositories with `git subtree split` **for deployment and sharing only.** During day-to-day PR work, do not push directly to the sub-repositories or `main`.

| Prefix folder     | Sub-repository (private)            | Contents                                      |
| ----------------- | ----------------------------------- | --------------------------------------------- |
| `frontend/`       | `<owner>/<app>-frontend`            | React app, Dockerfile, nginx.conf, its own CI |
| `backend/`        | `<owner>/<app>-backend`             | Express API, Dockerfile, its own CI           |
| `database/`       | `<owner>/<app>-db`                  | SQL migrations, README                        |
| `infrastructure/` | `<owner>/shared-aws-infrastructure` | Terraform shared by several apps, its own CI  |

- First creation: `scripts/create-repositories.ps1 -Owner <owner>`. It creates 5 repositories, splits each prefix folder into an `export/<part>` branch, and pushes it to the sub-repository's `main`.
- Sync: `scripts/push-repositories.ps1`. Run it **only when the user asks for a sync** (it pushes the umbrella `main` too).
- If you edited a sub-repository directly, first bring it in with `git subtree pull --prefix=<part> <url> main --squash`.
- So that each sub-repository builds on its own, keep a `package-lock.json`, `.github/workflows/ci.yml`, `.gitignore`, and `.dockerignore` in each of `frontend/` and `backend/`.

### 4.2 Directory layout

```text
<app>/
├─ AGENTS.md                 # Shared AI instructions (Codex is the baseline, Claude reads it too)
├─ CLAUDE.md                 # [Recommended] "Follow AGENTS.md" + Claude-only differences
├─ README.md
├─ package.json              # workspaces, shared scripts, lint and format tools
├─ package-lock.json
├─ .nvmrc / .node-version    # 24.21.0
├─ .npmrc  .editorconfig  .gitattributes  .gitignore
├─ .prettierrc.json  .prettierignore  eslint.config.mjs
├─ .env.example              # Examples without secrets only
├─ compose.yaml
├─ .github/workflows/ci.yml  # Integrated CI
├─ frontend/  backend/  database/  infrastructure/
├─ scripts/                  # Repository creation, sync, backup, and check scripts
├─ skills/<app>-*/SKILL.md   # Source of the AI work procedures
├─ .claude/skills/           # Copy for Claude Code (npm run skills:sync)
└─ docs/  changes/  daily/  next-steps/
```

- `.local/` is for local tools, temporary worktrees, and logs. Exclude it from Git and Prettier.
- As features grow, do not keep every screen in a single `frontend/src/main.tsx`; split into modules per feature (`routines.tsx`, `body.tsx`, and so on). In workout-memo `main.tsx` grew large and concurrent PRs conflicted often.

## 5. Core configuration files

Below is what workout-memo actually uses. Replace only the names and ports with placeholders.

### 5.1 Runtime, editor, line endings

`.nvmrc`, `.node-version`

```text
24.21.0
```

`.npmrc`: block installs when the engine does not match, and save dependency versions exactly.

```ini
engine-strict=true
save-exact=true
```

`.editorconfig`

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

`.gitattributes`: the repository is LF, and only the PowerShell scripts are CRLF.

```text
* text=auto eol=lf
*.ps1 text eol=crlf
```

### 5.2 Root `package.json`

```json
{
  "name": "<app>",
  "private": true,
  "workspaces": ["frontend", "backend"],
  "scripts": {
    "dev": "concurrently -k \"npm run dev -w backend\" \"npm run dev -w frontend\"",
    "build": "npm run build -w frontend && npm run build -w backend",
    "test": "npm run test -w backend",
    "test:skills": "node --test scripts/test/claude-skills.test.mjs",
    "skills:sync": "node scripts/claude-skills.mjs sync",
    "skills:check": "node scripts/claude-skills.mjs",
    "check": "npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:skills && npm run build",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint . --max-warnings 0",
    "typecheck": "npm run typecheck --workspaces"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "concurrently": "^9.2.0",
    "eslint": "10.12.0",
    "eslint-config-prettier": "10.1.8",
    "eslint-plugin-react-hooks": "7.1.1",
    "globals": "16.5.0",
    "prettier": "3.9.10",
    "typescript-eslint": "8.71.2"
  },
  "allowScripts": { "esbuild@0.28.2": true, "esbuild@0.25.12": true },
  "engines": { "node": "24.21.0", "npm": "11.19.0" },
  "packageManager": "npm@11.19.0",
  "volta": { "node": "24.21.0", "npm": "11.19.0" }
}
```

One `npm run check` runs everything: format, lint, types, tests, and build. **Always run it before a commit and before you create or update a PR.** If you add a local AI worker, add `test:agents` to `check` (see workout-memo).

### 5.3 Format and lint

`.prettierrc.json`

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

`.prettierignore`

```text
node_modules/
**/dist/
.local/
.git/
.env
package-lock.json
**/package-lock.json
infrastructure/.terraform/
**/*.tfstate*
backups/
.bkit/
.playwright-mcp/
```

`.bkit/` and `.playwright-mcp/` are local outputs made by the Claude Code plugin and browser tools. If Prettier checks these folders, `npm run check` fails.

`eslint.config.mjs`

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '.local/**', 'infrastructure/.terraform/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' },
  },
  prettier,
);
```

Code rules: use PascalCase for React components and types, and camelCase for variables and functions. Prefix an argument that you must accept but do not use (such as in the Express error middleware) with `_`. At error boundaries, receive it as `unknown` and check only the fields you need.

### 5.4 `.gitignore`

```text
node_modules/
dist/
.env
*.log
.terraform/
*.tfstate*
*.tfplan
backups/
.local/
.bkit/
.playwright-mcp/
```

### 5.5 TypeScript

`frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src", "vite.config.ts"]
}
```

`backend/tsconfig.json` (build) and `backend/tsconfig.check.json` (type checks up to the tests)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

```json
{ "extends": "./tsconfig.json", "compilerOptions": { "noEmit": true }, "include": ["src", "test"] }
```

### 5.6 Workspace `package.json` scripts

- frontend: `"dev": "vite --host 127.0.0.1"`, `"build": "tsc --noEmit && vite build"`, `"typecheck": "tsc --noEmit"`
- backend: `"dev": "tsx watch --env-file-if-exists=../.env src/server.ts"`, `"start": "node dist/server.js"`, `"build": "tsc"`, `"test": "tsx --test test/*.test.ts"`, `"typecheck": "tsc -p tsconfig.check.json"`
- Both workspaces have `engines`, `packageManager`, `volta` (the same values as the root, written out directly instead of `extends`), and `"allowScripts": { "esbuild": true }`. Volta reads only the `volta` of the nearest `package.json`, so put it in each file so the same version is picked in the workspace folders and in the sub-deployment repositories too.

`frontend/vite.config.ts`

```ts
import { defineConfig } from 'vite';
export default defineConfig({ server: { proxy: { '/api': 'http://127.0.0.1:<api-port>' } } });
```

### 5.7 Docker Compose and images

`compose.yaml`: bind every port only to `127.0.0.1` (protecting an app without login).

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-<db>}
      POSTGRES_USER: ${POSTGRES_USER:-<db>}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Copy .env.example to .env and set password}
      TZ: <timezone>
    ports: ['127.0.0.1:<db-port>:5432']
    volumes:
      - <app>-data:/var/lib/postgresql/data
      - ./database/migrations:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -h 127.0.0.1 -U $$POSTGRES_USER -d $$POSTGRES_DB']
      interval: 5s
      timeout: 5s
      retries: 15
    restart: unless-stopped
  api:
    build: ./backend
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-<db>}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-<db>}
      PORT: <api-port>
      TZ: <timezone>
    depends_on:
      db: { condition: service_healthy }
    restart: unless-stopped
  web:
    build: ./frontend
    ports: ['127.0.0.1:<web-port>:80']
    depends_on: [api]
    restart: unless-stopped
volumes:
  <app>-data:
```

`.env.example`

```ini
POSTGRES_DB=<db>
POSTGRES_USER=<db>
POSTGRES_PASSWORD=change-this-local-password
DATABASE_URL=postgres://<db>:change-this-local-password@localhost:<db-port>/<db>
PORT=<api-port>
```

`backend/Dockerfile`: split the build and the run, and run the run stage as a non-root (`node`) user.

```dockerfile
FROM node:24.21.0-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --global npm@11.19.0
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
FROM node:24.21.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE <api-port>
CMD ["node", "dist/server.js"]
```

`frontend/Dockerfile` + `frontend/nginx.conf`

```dockerfile
FROM node:24.21.0-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --global npm@11.19.0
RUN npm ci
COPY . .
RUN npm run build
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  location /api/ { proxy_pass http://api:<api-port>; proxy_set_header Host $host; }
  location / { try_files $uri $uri/ /index.html; }
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy same-origin always;
}
```

## 6. Backend and DB implementation rules

### 6.1 API structure

- `createApp(pool)` builds and returns the Express app, and `server.ts` only calls `listen`. Then tests can start the app with a real DB pool or a fake pool. To fix "today" in tests, provide an injection point such as `createApp(pool, { today })`.
- `app.disable('x-powered-by')`, `express.json({ limit: '256kb' })`. Raise the limit separately, on that route only, for large upload routes (for example backup restore).
- Validate all input with Zod before touching the DB. A shared error middleware turns `ZodError` into 400 and a unique constraint violation (23505) into 409, and returns a Korean message.
- Check status with `GET /api/health`.
- Receive the pg `date` type (OID 1082) as a string: `types.setTypeParser(1082, (v) => v)`. This keeps it from turning into a JS `Date` and shifting by time zone.
- Wrap a change that writes several rows (a log plus its sets, and so on) in `BEGIN … COMMIT` on one client, `ROLLBACK` on error, and `release()` in `finally`.
- Use parameters (`$1`) in every query. If you must build a table or column name as a string, use constants only.

### 6.2 Save safety patterns (apply to the apps that need them)

- **Idempotent retry:** the client attaches a UUID `Idempotency-Key` to POST/PUT.
  - The server serializes the same key inside a transaction with `pg_advisory_xact_lock(hashtextextended(key))`.
  - It stores a request fingerprint (method, target, and the SHA-256 of the normalized body) and the response, and returns the same response for the same request.
  - Using the same key with different content is rejected with 409.
- **Concurrent edit conflicts:** keep a `version` on the row, and compare versions after `SELECT … FOR UPDATE`. If they differ, 409; if they match, update to `version+1`.
- **Browser draft:** keep what is being typed in `localStorage` (for example 7 days) and show the save state. Wrap all storage access in `try/catch` (private mode, quota exceeded).

### 6.3 DB and migrations

- PostgreSQL 17. Keep the migration source in **one place** only, `database/migrations/NNN_<description>.sql`.
- Number them with a 3-digit sequence. **Reserve the number when you start work so parallel branches do not use the same number.** In workout-memo, PRs opened at the same time once both used `003`.
- Write every migration so it is safe to re-run: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, and for seed data `INSERT … ON CONFLICT DO NOTHING/UPDATE`.
- Keep the meaning of existing data. For example, give a new `completed` column a default of `true` so the judgment of past records does not change.
- How to apply:
  - Empty volume: Compose runs every file in `/docker-entrypoint-initdb.d` automatically by name order.
  - CI: apply every file by name order with `psql -v ON_ERROR_STOP=1 -f`.
  - **Existing DB: run only the files not yet applied with `npm run db:migrate -w backend`.** The deployment does the same with `node dist/migrate.js`. Follow the [DB document](../database/README.md) for the procedure.

    When you must run a file by hand, **do not pipe it through PowerShell**, as in `Get-Content … | docker compose exec … psql`. Windows PowerShell 5.1 sends ASCII when piping to an external program, so Korean text turns into `?`. In workout-memo we reproduced the brand `'기타'` ("Other") being saved twice as `'??'`. If you have to pipe anyway, first set `$OutputEncoding = [System.Text.UTF8Encoding]::new($false)`.
- For Korean literals in SQL (CHECK values and so on), prefer a Unicode escape such as `U&'\AC00\C2B4'`. It is safe regardless of how it is applied.
- State the unit and NULL rules in the schema. Leave unconfirmed values as NULL and tell them apart from 0. Set numeric precision with `NUMERIC(p,s)`.
- Backup: `scripts/backup.ps1` saves `pg_dump --no-owner --no-acl` to a UTF-8 (no BOM) file. Exclude `backups/` from Git, also keep it in a safe place off the PC, and check restores regularly.

## 7. Tests and CI

### 7.1 Test principles

- Put the tests in the same commit as the implementation or fix. For a bug fix, add a regression test where you have confirmed **it fails before the fix and passes after it**.
- Do not repeat the internal implementation; verify the results the user can see and the domain rules.
- Do not make a failing test pass by skipping or deleting it or by weakening the judgment.

### 7.2 Test kinds [Currently applied]

| Kind           | Tool and method                                                                                                                                        | Example file                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Unit           | `node:test` + `assert/strict`, `tsx --test`                                                                                                            | `backend/test/*.test.ts`          |
| DB integration | A real PostgreSQL. **Skipped** if `TEST_DATABASE_URL` is not set. A skipped test is not counted as a pass                                              | `*.integration.test.ts`           |
| UI             | Load the component with `vm.runInNewContext` + `ts.transpileModule`, and check the render result with a fake React, `fetch`, `localStorage`, and clock | `*-ui.test.ts`                    |
| Browser        | A real dev server + Playwright (MCP), checking mobile 390px and PC 1440px. Not a replacement for automated regression; a manual check before the PR    | Record the result in docs/changes |

- Run DB integration tests **only on a dedicated test DB, not the user's DB.** Use a DB per branch (issue) or a schema per test so parallel work does not interfere.
- For tests that depend on dates, inject "today" or fix it with a fake `Date`.

### 7.3 Integrated CI (`.github/workflows/ci.yml`)

```yaml
name: Verify application
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env: { POSTGRES_USER: <db>, POSTGRES_PASSWORD: test, POSTGRES_DB: <db> }
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24.21.0', cache: npm }
      - run: npm install --global npm@11.19.0
      - run: npm ci
      - run: |
          for migration in database/migrations/*.sql; do
            psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" || exit 1
          done
        env: { TEST_DATABASE_URL: 'postgres://<db>:test@localhost:5432/<db>' }
      - run: npm run check
        env: { TEST_DATABASE_URL: 'postgres://<db>:test@localhost:5432/<db>' }

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t <app>-frontend:ci ./frontend
      - run: docker build -t <app>-backend:ci ./backend
```

`npm ci` inside the CI runner installs from the lockfile in an isolated GitHub environment, so it is separate from the rule that forbids local installs. The CI for the sub-repositories is as follows.

- `frontend/.github/workflows/ci.yml`: `npm ci` -> `npm run build` -> `docker build`
- `backend/.github/workflows/ci.yml`: `npm ci` -> `npm run build` -> `npm test` (unit tests without a DB, integration skipped) -> `docker build`
- `infrastructure/.github/workflows/ci.yml`: `terraform init -backend=false && terraform validate`

## 8. Design system

workout-memo has a calm green "workout notebook" tone. Unless told otherwise, a new project also starts from the tokens and components below. In a new project, define the values as **CSS variables (`:root`)** from the start. workout-memo wrote colors directly, which made it hard to share them later.

### 8.1 Tokens

| Token                 | Value                                                           | Use                                   |
| --------------------- | --------------------------------------------------------------- | ------------------------------------- |
| Font                  | `'DM Sans', 'Noto Sans KR', sans-serif` (Google Fonts)          | English DM Sans, Korean Noto Sans KR  |
| Base font size        | `14px`, `font-synthesis: none`                                  |                                       |
| Body color            | `#25372f`                                                       | Text                                  |
| Page background       | `#f7f8f5`                                                       |                                       |
| Sidebar background    | `#fcfcfa`, divider `#e5e8e1`                                    |                                       |
| Primary color         | `#294432` background / `#f3f7ec` text                           | Primary button                        |
| Accent (focus)        | `#a1bd56`                                                       | `:focus-visible` 3px outline, 3px gap |
| Card                  | Background `#fff`, border `#e3e7dd`, radius `9px`               |                                       |
| Modal                 | Background `#fcfdf9`, radius `12px`, shadow `0 20px 80px #0003` |                                       |
| Secondary background  | `#f4f6ef`, `#eaf0df`                                            | Tabs and info boxes                   |
| Muted text            | `#9aa48f`                                                       | Secondary description                 |
| Warning background    | `#fff0e9`                                                       | Errors                                |
| Button radius         | `6px`, padding `12px 17px`, text `12px/500`                     |                                       |
| Theme color (browser) | `<meta name="theme-color" content="#182b26">`                   |                                       |

### 8.2 Layout and components

- **Shell:** a fixed left sidebar (`aside`, width 234px, logo, navigation, and profile) and the content on the right. Put a breadcrumb ("My workspace › Screen") at the top.
- **Page header:** a small uppercase phrase (eyebrow) + a large title + a description + the primary button on the right.
- **Period bar:** tabs (1 day, 1 week, 1 month, 4 weeks, 12 weeks) + previous/next + a date input.
- **Stat card:** a label, a large number + unit, and a secondary description below.
- **Cards and list rows:** a date tile, a title, a summary, and on the right the figure, edit, and delete.
- **Three button kinds:** `primary` (main action), `subtle-button` (secondary), `text-button` (weak action). Use lucide-react for icons, and always give an icon-only button an `aria-label`.
- **Modal form:** a 2-column `form-grid`, and the label wraps the input (`<label>text<input/></label>`). Input hints use `form-hint`.
- **Status display:** save state uses `role="status"`, errors use `role="alert"`, toggles use `aria-pressed`, and an empty state shows a message (a title + a description + an action button).
- **Charts:** draw them by hand with SVG and CSS without a library, and give them `role="img"` and an `aria-label` that summarizes the values. Do not connect days with no value as 0.

### 8.3 Responsive and verification

- Breakpoints: `min-width: 1500px` (wide screens), `max-width: 1100px` (tablet), `max-width: 760px` (mobile).
- A PR that changes a screen is checked in a real browser at **mobile 390×844 and PC 1440×900**. Check that there is no horizontal scroll (`scrollWidth > innerWidth`) and record the result in docs/changes.
- Fix problems found in the browser check (a double-click toggle, a screen not refreshed after save, and so on) together with a regression test.

## 9. Git strategy

- **GitHub Flow:** keep `main` always deployable. Every change starts from an issue.
- **Order:** register a GitHub issue -> issue-number branch -> implementation, tests, and `docs/changes` record in the same commit -> `npm run check` -> PR -> automated code review (at most 2 rounds) -> CI check -> **the agent merges after CI passes**.
- **Issue:** write the purpose, scope, done criteria (checkboxes), how to verify, and boundaries. Leave rules that must be decided as "Decisions before implementation", and when the user decides, record the confirmed rule as an issue comment. Make the body a UTF-8 file and register it with `gh issue create --body-file`.
- **Branch:** `<type>/<issue-number>-<slug>`. The type is `feat`, `fix`, `docs`, or `chore` (for example `feat/12-workout-editor`). If a branch for the same issue already exists, keep using it.
- **Commit title:** `feat: <English summary> (#12)`. Write the reason in the body. For AI co-authoring, add a `Co-Authored-By:` line.
- **PR:** the target is `main`. Put the following in the body.
  - A summary, the main changes, and the actual check commands with pass/fail/skip
  - The check result for screen changes, and judgment calls and items to confirm
  - `Closes #N` (`Refs #N` for a partial implementation)

  If verification remains, leave it as a draft. If a PR for the same branch exists, update it and do not create a new one.

- **Review:** after you open the PR, go through the automated code review at most twice. If the review finds something to fix, apply it in an additional commit, and after the first fix get a second review once more. After the second fix commit, do no further review. If there is nothing to fix, go straight to the next step. Split fixes that are too large for this PR into new issue cards. Leave the result of each round in a PR comment and in the `docs/changes` record.
- **Merge:** when the required CI of the final head all passes, the agent merges with a merge commit (`pr merge <url> --merge --match-head-commit <verified head SHA>`) and checks that the `Closes #N` issue is closed. Merge stacked PRs in order. After the earlier PR is merged, merge `origin/main` into the next PR's branch to resolve conflicts, re-run the related tests to confirm both features survived, push normally (no force push), and merge after CI passes. This project currently does not trigger a deployment on a `main` merge.
- **Parallel work:** use a separate `git worktree` per issue. Avoid a shared stash, and split migration numbers and test DBs per issue.

## 10. AI instruction system

### 10.1 File roles

| File                                                       | Role                                                                                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                | Shared instructions for all agents. Work procedure, project baseline (ports, time zone, units), verification commands, prohibitions, account rules |
| `CLAUDE.md` [Recommended]                                  | The file Claude Code reads automatically. Write briefly "this project follows `AGENTS.md`" + only the Claude-specific differences                  |
| `skills/<app>-implementation/SKILL.md`                     | Procedure: issue -> branch -> implementation and docs -> tests -> PR -> automated review (at most 2 rounds) -> merge after CI passes               |
| `skills/<app>-testing/SKILL.md`                            | Standard for writing, running, and recording tests                                                                                                 |
| `skills/<app>-foundation/SKILL.md` + `references/stack.md` | Development foundation, tech recommendations, and the order of adoption                                                                            |
| `.claude/skills/`                                          | The Claude Code copy of `skills/`. Edit only the source and update with `npm run skills:sync`; `npm run check` fails on a mismatch                 |

- The skill source is the single repository folder `skills/`. Codex installs it in `skills/` of the Codex home, and Claude Code reads `.claude/skills/`.
- A skill file has YAML front matter (`name`, `description`). After a change, check it with skill-creator's `quick_validate.py` (`PYTHONUTF8=1` on Windows).
- Do not use repository-path relative links in the skill body. This is so the links do not break when the copy lives elsewhere.

### 10.2 Items to put in `AGENTS.md` (template)

```markdown
# <App display name> project instructions

## Implementation procedure

For requests to change features, fixes, refactoring, settings, docs, and skills, follow skills/<app>-implementation/SKILL.md.

1. Register an issue in <owner>/<app> (reuse an existing issue the user named).
2. Create a `<type>/<issue-number>-<slug>` branch.
3. Write the implementation and tests together, and include a docs/changes/<issue-number>-<slug>.md record in each commit.
4. Run `npm run check` before commits and before creating or updating a PR, and record the results in the docs and the PR.
5. **After the PR, go through the automated code review at most twice (split large fixes into new issue cards), and when all required CI checks pass, the agent merges the PR (`--merge --match-head-commit <head SHA>`).** Merging with a failed or running check, bypassing branch protection, self-approval, pushing directly to `main`, and force pushes are forbidden.
   Answering questions, recommendations, and read-only investigation do not create an issue or a branch.

## Project baseline

- Stack: React + Vite + TypeScript, Express + pg + Zod, PostgreSQL 17, npm workspaces, Docker Compose, GitHub Actions.
- Web port <web-port>, host DB port <db-port> (bound to 127.0.0.1). Do not change them without a user request.
- Dates YYYY-MM-DD, time zone <timezone>. <Domain unit and NULL rules>.
- Validate and judge input on the server too. Use a transaction for changes to several rows.
- Do not commit or record .env, tokens, real backups, or Terraform state.
- Do not overwrite user changes, and stage only the files you need.
- Install or remove npm packages only after the user reconfirms, preferring --ignore-scripts.
- Syncing the sub-repositories (scripts/push-repositories.ps1) and AWS deployment only on separate request.

## Verification commands

- Full: `npm run check`. DB integration: run `npm test` after setting `TEST_DATABASE_URL` of a dedicated DB (skipped if not set = not verified).
- Infrastructure: `terraform validate`. Docs and skills only: format, link, and skill validator.

## Documents

- docs/changes (per issue), docs/daily (summary of a work day), docs/next-steps (latest next work).
```

### 10.3 Account separation (a PC that uses work and personal accounts together)

- Leave the default `gh` as it is and use a project-specific wrapper (`scripts/gh-project.ps1`). The wrapper clears the inherited `GH_TOKEN`/`GITHUB_TOKEN` and applies the token obtained with `gh auth token --user <owner>` to that call only.
- Point Git push at the wrapper with this repository's **local** credential helper. Do not change the global helper.
- Before remote work, check that `<wrapper> api user --jq .login` is `<owner>`. Do not work around it with another account.
- Run the wrapper inside a git repository. It fails if run outside a repository.
- Choose the Codex personal profile with the `CODEX_HOME` environment variable. For the implementation details see `docs/project-github-auth.md` in workout-memo.

### 10.4 [Optional] Local AI worker

workout-memo runs a worker (`scripts/agents.ps1`) that takes a confirmed issue put in a queue and automatically handles test -> implementation -> independent review -> checks -> PR on the PC. A new project does not need it from the start. When you adopt it, keep the following in mind.

- Pin the model per role (for example the top model for planning, debugging, and high-risk review, and the standard model for tests, implementation, and review). Do not switch to another model on your own.
- Test the per-issue worktree, the lock, and the state transitions (`npm run test:agents`).
- **Inside a sandbox, the Vite/esbuild build can fail because of a parent-folder read permission problem.** Run the final `npm run check` on the host.
- Details: `docs/local-agent-workflow.md` in workout-memo.

## 11. Bootstrap checklist

You must pass the "Check" at the end of each step before going to the next.

1. **Fix the values:** get the placeholders in chapter 0 from the user. Check: the table is completely filled.
2. **Account and remote:** confirm the GitHub account to use, and prepare the wrapper from 10.3 if needed. Check: `api user --jq .login` = `<owner>`.
3. **Runtime:** pick Node 24.21.0 / npm 11.19.0 (with the user's tool such as nvm or Volta; do not change the system Node on your own). Pin Volta with the `volta` field of the root and each workspace `package.json`. Check: `node -v` and `npm -v` in the root and in each workspace folder.
4. **Skeleton files:** create the 4.2 structure and the configuration files of chapter 5, `.env.example`, `compose.yaml`, the Dockerfiles, nginx.conf, and `database/migrations/001_initial.sql` (the minimum tables).
5. **Install dependencies (user confirmation required):** show the package list in 3.1, get approval with the procedure of rule 1 in chapter 1, and then install. Check: `package-lock.json` and each workspace lockfile exist.
6. **Minimum feature:** create `createApp(pool)`, `GET /api/health`, 1 reference screen, 1 unit test, 1 DB integration test, and 1 UI test.
7. **Local verification:**
   - Start the DB with `docker compose up -d db`.
   - Create a dedicated test DB and apply all migrations with `psql -f`.
   - Set `TEST_DATABASE_URL` and run `npm run check`.

   Check: exit 0 and the DB tests were not skipped.

8. **Run the containers:** create `.env` and run `docker compose up --build -d`. Check: the screen at `http://localhost:<web-port>` and the `/api/health` response are normal.
9. **AI instructions:** create `AGENTS.md`, `CLAUDE.md`, the 3 skills, and the `.claude/skills` sync script and tests from chapter 10. Check: `npm run check` includes `test:skills` and it passes.
10. **Documents:** create the README (run, verification, repository layout), `docs/development-baseline.md`, `docs/changes/`, `docs/daily/`, and `docs/next-steps/`.
11. **Create the repositories:** after user approval, create the umbrella repository and the 4 sub-repositories as private with `scripts/create-repositories.ps1 -Owner <owner>`. Check: CI passes in each repository.
12. **Infrastructure draft:** put the Terraform of chapter 12 in `infrastructure/` and run `terraform init -backend=false && terraform validate`. Do a real `apply` only when the user requests a deployment.
13. **GitHub Flow from the first issue:** from then on, every change follows the procedure of chapter 9.

## 12. AWS infrastructure

### 12.1 [Currently applied] Shared Terraform draft (`infrastructure/`)

- Region `<region>` (default `ap-northeast-2`) and a `project` variable (default `shared-apps`) are shared by several apps.
- **ECR:** a frontend and backend repository per app (`for_each`), immutable tags (IMMUTABLE), image scanning on push, AES256 encryption, and a lifecycle policy that keeps only the latest 10.
- **AWS Budgets:** `<budget-usd>` USD per month, an email when actual spend exceeds 80%. A budget alert **does not stop spending.**
- Run: `terraform init` -> `terraform plan -var='budget_email=…'` -> `terraform apply …`. **Do not put the state file in Git** (it may contain sensitive data).
- To add another app, add its name to the ECR `for_each` list.

```hcl
terraform {
  required_version = ">= 1.6.0"
  required_providers { aws = { source = "hashicorp/aws", version = "~> 5.0" } }
}
provider "aws" { region = var.region }
```

### 12.2 Deployment alternatives (not connected yet; costs are estimates based on the official Seoul region prices of 2026-10-15)

| Alternative                              | Setup                                                               | Monthly cost estimate (before tax)                                             | Note                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1. Shared server (several personal apps) | Docker Compose + PostgreSQL on 1 Lightsail instance, ECR, snapshots | 2 GB: about $13.50 / 4 GB: about $25.50 (whole server)                         | 0.5 to 1 GB leaves too little room. Separate DBs or schemas and permissions per app |
| 2. App server + managed DB               | EC2/Lightsail + RDS PostgreSQL                                      | Over the user's initial budget of KRW 30,000 to 60,000 (not a confirmed quote) | Less backup and maintenance burden                                                  |
| 3. Managed scale-out                     | ECS Fargate + ECR + RDS + ALB                                       | High fixed cost                                                                | When you need traffic and availability                                              |
| Static frontend only                     | Amplify and the like                                                | Calculated separately                                                          | The API and DB are needed separately                                                |

- **Do not expose an app without login directly to the public internet.** Design a VPN, a private connection, or authentication first.
- Things to prepare together when you deploy: HTTPS, remote state (S3 + locking), a GitHub OIDC deployment role (no long-lived keys), image version tags, health checks, CloudWatch log retention, backup and restore procedures, and how to roll back to the previous image.
- Detailed cost calculation: `docs/shared-hosting-costs.md` in workout-memo.

## 13. Pitfalls confirmed in this project

| Symptom                                                                    | Cause                                                              | Response                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Korean is saved as `?` in the DB and re-applying creates duplicate rows    | The PowerShell 5.1 pipe sends ASCII                                | Run the mounted file with `psql -f`, or set `$OutputEncoding` to UTF-8, and write SQL with the `U&` escape |
| Only the build of `npm run check` fails in the AI sandbox                  | Vite/esbuild cannot read the parent folder (shared `node_modules`) | Run the final check on the host and record the result                                                      |
| The Prettier check suddenly fails                                          | Tool outputs such as `.bkit/` and `.playwright-mcp/`               | Add them to `.gitignore` and `.prettierignore`                                                             |
| Parallel PRs use the same migration number                                 | Each branch picks its own next number                              | Reserve the number when you start                                                                          |
| Several PRs keep conflicting in the same large file (`main.tsx`, `app.ts`) | Screens and routes are gathered in one file                        | Split into per-feature modules, and in later PRs merge `main` and confirm both features with tests         |
| A double-click on a toggle button reverts the state                        | The two clicks are handled in different renders                    | Ignore an opposite action within a short time + a regression test                                          |
| Data saved on another screen does not show when you return                 | The screen does not reload on entry                                | Re-fetch on screen switch                                                                                  |
| Server validation errors show in the original English                      | The default Zod message                                            | Give explicit messages for validation the user can see                                                     |
| After a backup "replace all", a retry answers a deleted id as "saved"      | The idempotency retry key is still there                           | On a replace restore, reset the retry keys in the same transaction                                         |
| A DB test looked like it "passed" but did not actually run                 | Skipped when `TEST_DATABASE_URL` is not set                        | Check the skip count and report what was not run separately                                                |

## 14. Original files to consult (workout-memo)

When you bring the settings over as they are, compare against the files below as the source.

- Instructions: `AGENTS.md`, `skills/workout-implementation/SKILL.md`, `skills/workout-testing/SKILL.md`, `skills/workout-foundation/SKILL.md`, `skills/workout-foundation/references/stack.md`
- Settings: `package.json`, `.npmrc`, `.editorconfig`, `.gitattributes`, `.prettierrc.json`, `.prettierignore`, `eslint.config.mjs`, `frontend/tsconfig.json`, `backend/tsconfig*.json`, `frontend/vite.config.ts`
- Run: `compose.yaml`, `.env.example`, `frontend/Dockerfile`, `frontend/nginx.conf`, `backend/Dockerfile`
- CI: `.github/workflows/ci.yml`, `frontend|backend|infrastructure/.github/workflows/ci.yml`
- Repository: `scripts/create-repositories.ps1`, `scripts/push-repositories.ps1`, `scripts/backup.ps1`, `scripts/claude-skills.mjs`
- Infrastructure: `infrastructure/main.tf`, `infrastructure/versions.tf`, `infrastructure/README.md`
- Documents: `docs/development-baseline.md`, `docs/project-github-auth.md`, `docs/local-agent-workflow.md`, `docs/shared-hosting-costs.md`, `docs/agent-issue-template.md`
