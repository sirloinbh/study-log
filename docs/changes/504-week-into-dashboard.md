# #504 Merge Week and 12 weeks into Dashboard

- Issue: [#504](https://github.com/sirloinbh/study-log/issues/504) (tracking: sirloinbh/project-standards#1215)

## Changes — 2026-11-28

- The Week and 12 weeks menu items are removed. Dashboard has a "Dashboard view" choice: Summary (the old dashboard), Week, 12 weeks. The choice is kept in the address (`?view=week`, `?view=12weeks`).
- `/week` and `/twelve-weeks` redirect to `/dashboard?view=week` and `/dashboard?view=12weeks`.
- Tests: `app.test.tsx` checks the menu and both redirects.
