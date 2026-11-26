# 421: Translate the remaining Korean screen text to English

## What changed

- `backend/src/retrospective-draft.ts`: the retrospective draft prompt now says "in English when unsure" (was Korean) for the case where the memos give no clear language. A draft still follows the language most memos use.
- `backend/src/translation.ts`: a stale comment said the translation error message is Korean; it is English.
- Nothing else needed translating. The grep `git grep -P '[\x{AC00}-\x{D7A3}]'` over `backend/src`, `frontend/src`, `e2e` and `database` (tests and SQL comments aside) finds only the TOC parse patterns in `toc.ts` and one example in `contents-paste-form.tsx`, which must stay Korean to match Korean headings. Dates and numbers already use `en-US`/`en-CA`/`en-GB`. Holiday names come from the API but are never shown on a screen.
- Kept on purpose: the Korean translation feature (#31) and its `lang="ko"` text, and the feedback prompt that answers in the language of the solution (user data).

## Checks

- Screen walk at 390x844 (Vite dev server, `/api` mocked with empty lists, Chrome): `/`, `/schedules`, `/textbooks`, `/keywords`, `/flashcards`, `/wrong-exercises`, `/coding`, `/settings` show no Hangul in text, placeholders, aria-labels or titles. `/reviews`, `/stats`, `/retrospectives` rendered nothing under the empty mock, so they were covered by the code grep only.
- `frontend/src/lib/use-notice.ts` still has an outdated comment about "Korean text"; it is a managed file and was not edited.
