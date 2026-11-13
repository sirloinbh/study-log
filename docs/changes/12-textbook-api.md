# #12 Textbook basic info DB and API (title, author, edition)

- Issue: [#12](https://github.com/sirloinbh/study-log/issues/12) (parent #5)
- Branch: `feat/12-textbook-api`
- Migration number: `003` reserved and used (`002` is #10)

## Purpose

Build the base data for textbook-based study management.

## Decisions (confirmed with the user, [issue comment](https://github.com/sirloinbh/study-log/issues/12#issuecomment-6315556399))

- Refuse to delete a textbook that has linked study logs (409). The table of contents, exercises, and answers are deleted with the textbook.
- At the time of this issue there are no linking tables, so a delete succeeds as it is. The refusal is applied in #14 (`ON DELETE RESTRICT`), and deleting together in #13, #24, and #26 (`ON DELETE CASCADE`).

## Changes

- `database/migrations/003_textbooks.sql`: `textbooks` (title 1 to 200 characters required, author and edition default `''`). Safe to re-run with `IF NOT EXISTS`.
- `backend/src/textbooks.ts`: `GET /api/textbooks` (by title), `GET/PUT/DELETE /api/textbooks/:id`, `POST /api/textbooks` (201). Leading and trailing spaces removed, Korean validation messages, and a missing ID is 404 `교재를 찾을 수 없습니다` ("Textbook not found").
- `backend/src/app.ts`: registered the `/api/textbooks` router.
- `backend/test/helpers.ts`: at first I added `call(path, { method, body })` and 204 response support. #10 (PR #55) merged first with the same change plus `rawBody` and `contentType`, so after merging main this PR has no net change.

## Tests

- `backend/test/textbooks.test.ts` (unit, fake pool): a missing title, only spaces, over length, the author format, the edition length, and a wrong ID give a Korean 400 before the DB lookup. 404 for lookup, edit, and delete of a missing textbook.
- `backend/test/textbooks.test.ts` (first-review fix): the validation cases run on both POST and PUT. A Korean 400 for a body that is not an object and for broken JSON, and 400 for 7 kinds of IDs (`0`, `-1`, `1.5`, `1e3`, `0x10`, `01`, 20 digits) × GET, PUT, and DELETE.
- `backend/test/textbooks.integration.test.ts` (a real DB): creation (spaces removed), the author and edition defaults, the list by title, edit, and 404 after a delete. It cleans up only the rows with a dedicated title prefix.

## Verification

| Command                                           | Environment                        | Result                                                                                                                                                                             |
| ------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` run 1                             | Local, `TEST_DATABASE_URL` not set | exit 1: the `textbooks.test.ts` 404 test failed with `fetch failed: bad port`. An existing helper problem where a random port was assigned a port fetch forbids; registered as #56 |
| `npm run check` run 2                             | The same environment               | exit 0. backend tests 11, pass 9, fail 0, skipped 2 (DB integration), skills 4 pass, build passed                                                                                  |
| GitHub Actions `verify` (PR #57, run 39601039827) | Postgres 17 + migrations applied   | pass: backend tests 11, pass 11, skipped 0 (the DB integration actually ran), skills 4 pass. `docker-build` pass                                                                   |

## Merging origin/main (after the #10 PR #55 merge)

- After the PR #55 merge (d3561fc), I merged `origin/main` into this branch.
- Conflict: `backend/test/helpers.ts`. The main side was a superset that added the `rawBody` and `contentType` options to this branch's change, so I took the main side as it is.
- `backend/src/app.ts`: I tidied the auto-merged imports and the router registration order (`/api/study-logs` then `/api/textbooks`). There is no behavior change.
- The migration numbers `002` (#10) and `003` (#12) do not overlap.
- Verification: local `npm run check` exit 0. backend tests 19, pass 16, fail 0, skipped 3 (DB integration), skills 4 pass, build passed.
- CI (48f2095, run 39687749020): `verify` pass. backend tests 19, pass 19, skipped 0 (the DB integration actually ran), skills 4 pass.

## Automated code review, round 1

A separate read-only review agent reviewed the issue #12 done criteria and the whole PR diff (as of 48f2095). There were no defects in the migration being safe to re-run, the delete policy, SQL parameterization, or the router registration order.

- Comment (high): the ID validation was `z.coerce.number()`, so it accepted `1e3`, `0x10`, and `01`. A 20-digit number became a 500 from the Postgres bigint range error, and `9007199254740993` turned into a different row.
  - Applied: as in #10, it accepts only positive integers of 1 to 15 digits with no leading zero.
- Comment (medium): an array body answered 400 with Zod's English message `Expected object, received array`.
  - Applied: I gave the object schema the Korean message "교재 내용을 JSON 객체로 보내세요" ("Send the textbook content as a JSON object"). I removed `req.body ?? {}` so a request with no body gets the same message.
- Comment (low): the validation tests covered only POST and `/0`.
  - Applied: the validation cases in `textbooks.test.ts` run on both POST and PUT.
  - I added tests for a body that is not an object and for broken JSON.
  - I added a test that sends the 7 kinds of IDs to GET, PUT, and DELETE.
  - I confirmed that 2 new tests fail when run with `textbooks.ts` before the fix.
- Comment (low): the description of `helpers.ts` in this document did not match there being no net change, and the CI result after the merge was missing. Applied: I fixed the Changes and merge sections above.
- Split: the problem that a string containing a NUL character answers 500 is a common problem that applies to study logs too. I split it into [#58](https://github.com/sirloinbh/study-log/issues/58).
- Verification: local `npm run check` exit 0. backend tests 21, pass 18, fail 0, skipped 3 (DB integration), skills 4 pass, build passed.

## Automated code review, round 2

A separate read-only review agent checked the first-round fixes (d61bee9), the added diff (48f2095..d61bee9), and the final whole diff again.

- All 4 first-round comments were applied exactly and completely. There is no regression in the added diff.
- There are no remaining comments. Under the policy of at most 2 reviews, I do not do a third.
- Non-blocking note: the first-round fix tests were missing from the Tests section. I reflected that in this document.
- Verification: CI (d61bee9, run 39688320714) `verify` pass. backend tests 21, pass 21, skipped 0 (the DB integration actually ran). I merge after confirming that the CI of the final head passes.

## Limits and follow-up

- There is no PostgreSQL locally, so the DB integration tests were checked only in CI.
- The screen is added in #21 and the table of contents in #13. The intermittent test port failure is #56, and NUL handling in strings is #58.
