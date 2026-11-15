# #30 Read problems and answers from a PDF or photo, review them, then save

- Issue: [#30](https://github.com/sirloinbh/study-log/issues/30) (parent #5)
- Branch: `feat/30-file-extraction`
- Prerequisites: #29 method (Claude), #28 upload foundation, #31 translation (the Claude SDK and key)

## Purpose

Typing every problem of a chapter by hand is slow. The user picks a PDF page or a photo, Claude reads it, and the user checks the result before anything is saved.

## Decisions

- Method (#29): Claude, rules in `docs/decisions/extraction-rules.md`.
- User decisions (2026-11-16, [#30 comment](https://github.com/sirloinbh/study-log/issues/30#issuecomment-6902994260)):
  - The file is picked on a chapter's exercises screen and sent to Claude **without being kept**. No S3 bucket is needed.
  - Answers from an answers-only file are matched to the chapter's exercises by number, and the user fixes any mismatch before saving.
- Rules I set (recorded in the rules document): model Sonnet 5.5 with effort `medium`, streamed with `max_tokens` 64,000; at most 200 items per file; one reading per chapter at a time (409); a long number is cut to 20 characters.

## Changes

- `backend/src/extraction.ts` (new): `Extractor`, `claudeExtractor()`, `ExtractionError`. Sends a PDF as a `document` block or a JPEG/PNG as an `image` block, with server-side fallbacks and JSON schema output, as translation does.
- `backend/src/translation.ts`: the SDK error mapping moved into `apiFailure(error, what)`, shared by translation and extraction. Translation messages are unchanged.
- `backend/src/exercises.ts`, under `/api/textbooks/:textbookId/contents/:contentId/exercises`:
  - `POST /extract` (multipart `file`, `kind` = `problems` or `answers`): needs the app header (403), multipart (415), an existing chapter (404, checked before the body is read), a known format (415). Returns `{ items, model }` and saves nothing.
  - `POST /bulk` `{ exercises: [{ number, body, important?, answer? }] }`: saves 1 to 200 problems with their answers in one transaction, holding the chapter row so it cannot be deleted halfway. Its JSON body may be up to 2 MB (`app.ts`); other requests keep 256 KB.
  - `PUT /answers` `{ answers: [{ exerciseId, body }] }`: replaces the answers of exercises in this chapter in one transaction. 400 if an id repeats or an exercise is not (any more) in the chapter.
- `backend/src/exercise-files.ts`: `receive` is exported for the extract route.
- `backend/src/app.ts`: `createApp` takes `extractor` (default `claudeExtractor()`).
- `frontend/src/exercise-extraction.tsx` (new): the "Read problems from a file" panel. File input, what the file holds, a cost note, then a review list: per problem a "Save this one" box and editable number, text and answer; per answer a "Save to" select preset by number. Save buttons say how many will be saved.
- `frontend/src/exercises.tsx`: a "Read from file" button opens the panel for the chosen section; after saving, the list reloads and says how many were saved.
- `frontend/src/api.ts`: `requestForm()` posts multipart with the app header. `frontend/src/exercise.ts`: `matchExercise()`. `frontend/src/style.css`: panel styles.

## Verification

- New tests:
  - `backend/test/extraction.test.ts` (fake SDK client): what is sent for a PDF and a photo, how items are cleaned up, and every error (refusal 422, cut-off, unreadable, over 200 items, authentication, missing key, an API 400) plus non-API errors passing through.
  - `backend/test/exercise-extraction.integration.test.ts` (test DB, stand-in extractor): every refusal of `/extract`, a read that saves nothing, an extractor error, the 409 while one is running, `/bulk` rolling back fully when the second problem is invalid, saving with answers, and `/answers` rejecting another chapter's exercise or a repeated id and then replacing answers.
  - `frontend/src/exercise-extraction.test.tsx`: reviewing, editing and saving problems; answers matched by number, moved, and blocked when two point at one problem; a failed save keeping the review; no file, a file over 20 MB, and an empty result; the number matching rule.
- `backend/test/helpers.ts`: tests refuse a real extraction call unless they pass an extractor.
- `npm run check` (2026-11-16, `TEST_DATABASE_URL` set to the Docker test DB): exit 0. Backend 441 passed, 0 skipped; frontend 228 passed, 2 skipped; other suites 4 passed.
- Browser check (headless Chrome through the DevTools protocol, 2026-11-16): a temporary server on the test DB with a stand-in extractor (no paid call), Vite on 5302.
  - 1440×900: the panel opens with the cost note; 3 problems shown; unticking one and saving lists 2 problems and closes the panel; an answers-only reading matches answer 1.2 to Problem 1.2 and leaves the unmatched ones as "Don't save"; the saved answer shows under Problem 1.2; no horizontal scroll. 7 of 7 checks passed.
  - 390×844: the panel and the problem review fit with no horizontal scroll. 3 of 3 checks passed.
  - The test data was deleted afterwards.

## Limits and follow-up

- Not checked against the real Claude API or real textbook pages: I could not confirm a key is set locally, and no sample pages were available. The first real use is the check of extraction quality.
- Only one file per reading; a whole book should be read a chapter at a time.
- Deploying needs the nginx body limit raised for files over 1 MB ([project-standards#589](https://github.com/sirloinbh/project-standards/issues/589)), as for uploads.
