# #74 Adding an exercise to a chapter deleted elsewhere does not update the screen

- Issue: [#74](https://github.com/sirloinbh/study-log/issues/74) (split from the #73 review)
- Branch: `fix/74-deleted-chapter-exercise`

## Problem

If the chapter picked on the exercises card was deleted elsewhere (another tab and so on), there was no way out.

- Adding an exercise failed with 404 "목차를 찾을 수 없습니다" ("Table of contents entry not found"), and the list refresh that followed was also 404, so "연습문제를 불러오지 못했습니다" ("Could not load the exercises") was shown together.
- The table of contents tree was not reloaded, so the deleted chapter stayed in the "단원" ("Chapter") select.

## Changes

- `frontend/src/Exercises.tsx`
  - If the server gives 404 "목차를 찾을 수 없습니다" for a chapter, it reports with `onContentMissing`.
    - It applies to both a failed change such as adding, editing, or deleting an exercise or saving an answer, and a failed list lookup.
    - A 404 for a single missing exercise ("연습문제를 찾을 수 없습니다", "Exercise not found") does not apply.
  - If the chapter is not in the reloaded tree, it goes back to the first chapter. This is the existing behavior.
  - It shows "선택한 단원이 다른 곳에서 삭제되었습니다. 첫 단원을 보여 줍니다" ("The selected chapter was deleted elsewhere. Showing the first chapter") in the status area. If no chapter is left, it shows only the first sentence.
  - If you pick another chapter, the notice disappears.
- `frontend/src/TextbookContents.tsx`: reloads the tree when `reloadKey` changes. Until the new tree arrives, it keeps the tree that was showing.
- `frontend/src/Textbooks.tsx`: receives the notification from the exercises card and raises the `reloadKey` of the table of contents card. The exercises card receives the same tree, so the chapter selection is updated too.

## Tests

- `backend/test/exercises-ui.test.ts` (3 added)
  - Whether adding to a deleted chapter reloads the tree once, that chapter and its sections leave the selection, and the first chapter and the notice are shown. Whether the error box does not remain, and the notice disappears when you pick a chapter.
  - Whether picking the deleted chapter left in the old tree (a 404 on the list lookup) reloads the tree
  - Whether a 404 for a single missing exercise does not reload the tree
- Fake API
  - It gives 404 "목차를 찾을 수 없습니다" for a chapter not in the tree.
  - It gives a copy of the tree on every request. Before that, when a test deleted a chapter, the "old tree" held by the screen changed with it, so it could not imitate a chapter deleted elsewhere.
- I confirmed that the first two tests fail on the code before the fix and pass after the fix.

## Verification

| Command         | Environment                        | Result                                                       |
| --------------- | ---------------------------------- | ------------------------------------------------------------ |
| `npm run check` | Local, `TEST_DATABASE_URL` not set | exit 0. backend tests 168, pass 156, fail 0, skipped 12 (DB) |

- Browser: I checked by starting the Vite dev server and the API (a local Docker test DB) with Playwright (Chromium).
  - Mobile 390×844
    - I added the chapter "9 지울 단원" ("9 Chapter to delete") to the textbook through the API, picked that chapter on the exercises card, and opened the exercise input.
    - After deleting the chapter through the API, "추가" ("Add") -> that chapter disappeared from the table of contents card and the chapter select, it went back to "2 행렬" ("2 Matrices"), the notice was shown, there was no error box, and no horizontal scroll
  - PC 1440×900: in the same state, the notice was shown and there was no horizontal scroll
  - Two network 404s remain in the console (the add request and the list request that followed). They are the expected responses.
  - Screenshots: [mobile 390×844](assets/74-mobile-390x844.png), [PC 1440×900](assets/74-pc-1440x900.png). I captured only the exercises card.

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no comments, so I do not do a second review. There is no issue to split off either.

- Confirmed points
  - One failure gives one signal. The refresh after a change (`refresh`) does not send a signal.
  - There is no repeat loop. If the chapter is still in the reloaded tree, `contentId` is unchanged so it does not request again.
  - The eslint exception in the effect uses only state setters, so it is safe.
  - If you change the textbook, the card is recreated and `lost` is reset.
  - The notice and the error display do not overlap.
  - The 404 message is the same as the backend's.
- Note (kept): if the table of contents card is reloaded by an external request while it is handling its own change, an old tree that arrives late can overwrite the new tree. The time window is narrow, and it is corrected at the next load. Request order management is looked at together in #75.

## Limits and follow-up

- The exercise input being written for the deleted chapter disappears. It is input tied to that chapter, so it is not moved to another chapter.
- The range selection of the important exercises card does not use this signal. When the table of contents is reloaded, a deleted chapter drops out of the range and it goes back to "교재 전체" ("Whole textbook").
