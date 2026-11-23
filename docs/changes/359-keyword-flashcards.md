# Keyword flashcards (#359)

## Rule (user decision 2026-11-23)

- The flashcards of a day are the keywords noted on the study date of every study log with an open review due by that day (overdue reviews count). Keywords of days with no due review, and of planned logs, are not shown.
- Known / not known is stored per keyword per day (`keyword_cards`, migration 027); answering again the same day replaces it; answers go with their keyword.
- Order: keywords whose latest earlier answer was "not known" first, then never answered, then known; answers of the day itself do not reorder, so the cards stay put while they are answered.

## What changed

- `GET /api/flashcards?date=` and `PUT /api/flashcards/:keywordId` (`backend/src/keyword-flashcards.ts`, in `docs/openapi.json`, audited as `keyword_card`).
- Flashcards screen `/flashcards` (menu: Flashcards): one card at a time, "Show memo", "I knew it" / "Not yet", starts at the first card not answered today, a summary with "Go through them again", error and retry states, focus on the keyword after each card.
- Tests: validation (`keyword-flashcards.test.ts`), real-database flow (`keyword-flashcards.integration.test.ts`, skipped without `TEST_DATABASE_URL`, runs in CI), screen (`flashcards.test.tsx`).

## Checked

- `npm run check`, `node .standards/check.mjs`; browser at 390x844 and 1440x900 (mocked API): flip, both answers, summary, no overflow, focus on the keyword.
- The SQL was not run locally (no database here); the integration test covers it in CI.
