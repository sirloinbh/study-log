# Remove the Flashcards menu and page (#471)

## Purpose

The user does not want the Flashcards quiz of review-day keywords. Part of epic #468.

## Changes

- Frontend: removed the nav item, the `/flashcards` route and `flashcards.tsx` with its test. `/flashcards` now falls through to the start page redirect.
- Backend: removed `flashcardRoutes` mounting, `keyword-flashcards.ts`, its tests and its OpenAPI entries. `/api/flashcards` now returns 404. `docs/openapi.json` was regenerated.
- The Reviews page and the review badge do not import anything from flashcards (checked with grep).

## Data decision

The user decided to drop old data of removed features (D1). `database/migrations/038_drop_keyword_cards.sql` drops `keyword_cards`. No old migration was edited. Nothing else read the table (export and backup did not include it).

## Verification

See the PR test section.
