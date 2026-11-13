# #110 Switch the screens to the shared design system

- Issue: [#110](https://github.com/sirloinbh/study-log/issues/110) (central tracking issue sirloinbh/project-standards#126)
- Branch: `feat/110-design-system`

## Purpose

The 8 apps decided to use the same tokens, components, layout, and PWA settings (central ADR-0007 and ADR-0008). I followed "Converting an existing app" in the central `docs/design-system.md` (workout-memo#160 applied it first).

## Changes (2026-10-26)

### Packages

The user installed them directly. They are the packages in the table of central ADR-0007 (pre-approved on 2026-10-22) and react-router, vitest, jsdom, and Testing Library (approved on 2026-10-26). All are pinned versions, more than 14 days past publication, with `--ignore-scripts`.

- dependencies: `@sirloinbh/design-tokens` 1.0.0, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `radix-ui` 1.7.0, `react-router` 8.4.0, `sonner` 2.0.8, `tailwind-merge` 3.7.0, `tw-animate-css` 1.4.0, `vaul` 1.1.2, `lucide-react` 0.468.0 -> 1.52.0
- devDependencies: `tailwindcss` and `@tailwindcss/vite` 4.3.3, `vitest` 5.0.3, `jsdom` 30.1.2, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/jest-dom` 7.0.1
- Two lockfiles (the root and `frontend/`): no package removed, and the only version change is `lucide-react`. All new entries come from the official registry, have integrity values, and have no install scripts. `ioc-scan`: no suspicious items

### Shared files (centrally managed)

They are exactly what was taken from the central sync preview with this app's `features.ui` and `features.vitest` turned on: 15 files in `frontend/src/components/ui/` and their tests, `components/layout/`, `lib/utils.ts` and `theme.ts`, `public/theme-init.js`, and `frontend/vitest.config.ts`.

### App code

- **Screens:** replaced the own sidebar and header with `AppShell` and gave the 6 pages addresses (`/` study logs, `/textbooks`, `/keywords`, `/stats`, `/retrospectives`, `/settings`). An unknown address is sent to study logs.
- **Styles:** `style.css` (879 -> about 770 lines) is loaded from `index.css` into the `components` layer. I removed the shell rules and Google Fonts, and made the element rules (`button`, `input`, and so on) apply only inside `:where(.legacy)`. The page body is `.legacy`.
- **Colors:** replaced the own variables (`--text`, `--muted`, and so on) with the shared tokens. `--muted` was a text color, so I moved it to `--muted-foreground`, and `--soft` (background) to `--muted`. I also changed `var(--line)` and `var(--soft)` of `StudyTimeChart` to `--border` and `--muted`.
- **Entry points:** `app.tsx` (screens), `main.tsx` (rendering and service worker registration only in the production build), `index.css` (Tailwind, `tw-animate-css`, shared tokens).
- **PWA:** 4 icons (central `scripts/pwa-icons.mjs`), and in `index.html` the manifest, the icons, the light and dark `theme-color`, `viewport-fit=cover`, and the flash prevention script.
- **Tests and build:** put a `test` (vitest) script and `src/test/setup.ts` in `frontend`, and the root `npm test` also runs the frontend tests. The production build leaves out test files with `tsconfig.build.json`. The Tailwind plugin in `vite.config.ts`.
- **Deleting the screen test in the backend:** `backend/test/app-ui.test.ts` was a temporary test that ran `main.tsx` with a fake React when there was no Vitest. The frontend Vitest tests check the same things (title, server status, error notice, and menu navigation) with a real React, so I deleted it.
- **Page tests in the backend:** in `backend/test/*-ui.test.ts` (165 tests), its own harness ran the whole `main.tsx` with a fake React and opened pages with the old menu buttons. The harness now runs the old minimal shell (`backend/test/ui-shell.ts`, a scaffold for tests) instead of `main.tsx`. The page components are the real frontend files as they are, so the page behavior checks do not change. The shell and routing are checked by the frontend Vitest tests with a real React.
- **Screen test (`app.test.tsx`):** showing the server date, the server error notice, moving between pages with the menu and showing the current page, and handling an unknown address.

## Verification

- Prettier, ESLint, `tsc` (everything), 40 frontend tests passed, `vite build`, and `ioc-scan`
- The backend tests need a DB, so CI checks them.
