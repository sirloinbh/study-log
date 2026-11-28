# Remove the Wrong problems menu and page (#473)

## Purpose

The user does not want the Wrong problems page. Part of epic #468.

## Changes

- Frontend: removed the nav item, the `/wrong-exercises` route (now redirects to the start page), `wrong-exercises.tsx` with its test, and the `WrongExercise` type.
- Backend: removed `wrongExerciseRoutes`, `wrongListQuery` and the `/api/exercises/wrong` mount and OpenAPI entry; `docs/openapi.json` regenerated. The two unit tests and one integration test of the list were removed; a new test checks the list is gone.
- `GET /api/exercises/wrong` no longer lists anything. It falls through to `/api/exercises/:id`, which refuses "wrong" as an id with 400 (the card said 404; forcing a 404 would need a special case in `exercises.ts`, which is not part of this card).

## Choice for implementation

As the card says: exercise attempts, wrong-answer reviews on the Reviews page and the Google Calendar entries (#403) stay as they are. No table is dropped and no migration is added.

## Verification

See the PR test section.
