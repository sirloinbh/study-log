# Remove the Keywords menu, page and API (#472)

## Purpose

The user does not want the Keywords feature. Part of epic #468.

## Changes

- Frontend: removed the nav item, the `/keywords` route (now redirects to the start page), `keywords.tsx`, `keyword.ts`, `keyword-form.tsx`, `keyword-search-card.tsx` and their tests, and the unused keyword CSS.
- Backend: removed `keywordRoutes` mounting, `keywords.ts`, its tests and OpenAPI entries; `docs/openapi.json` regenerated. `/api/keywords` now returns 404.
- Retrospective draft: the draft no longer reads keywords (`retrospectives.ts`, `retrospective-draft.ts`); it builds from study logs only (#475 also removed difficult parts). The prompt loses its `Keywords:` section.
- `coding-problems.ts`: only a comment mentioned keywords. The search and calendar sync have no keyword parts, and export and backup never read the table, so nothing changed there.
- Tests that used `/api/keywords` only as a generic endpoint (rate limit, cross-site, date format, zod validation) now use other endpoints; keyword-only cases were removed.

## Data decision

The user decided to drop old data of removed features (D1). `database/migrations/040_drop_keywords.sql` drops `keywords` (`keyword_cards` went in 038). No old migration was edited.

## Verification

See the PR test section.
