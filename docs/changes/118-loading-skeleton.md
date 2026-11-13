# #118 Change the loading display to the shared Skeleton and Spinner

- Issue: [#118](https://github.com/sirloinbh/study-log/issues/118)
- Branch: `chore/118-loading-skeleton`

## Purpose

While feature screens load, show a shared component instead of text. The rule is "Loading screen" in `docs/ui-components.md` of the central `sirloinbh/project-standards`.

## Changes

- `frontend/src/loading.tsx`: added `Loading` and `ButtonSpinner`.
- Replaced 21 places that had only text with `Loading`. Lists use `SkeletonList`, text and charts use `SkeletonText`, and statistics cards use 4 `SkeletonCard`.
- `frontend/src/busy.ts`: tells which request is being waited for with `action`. A screen names it with `nameNext` right before the request.
- Put `ButtonSpinner` on 18 buttons for save, add, search, and delete confirmation. It spins only on the pressed button.
- `backend/test/ui-harness.ts`: loads the shared components as named elements, like the chart parts.

## Implementation judgment

- Keep the sentence for reading aloud outside the `aria-busy` area. A notice inside a busy area may not be read aloud.
- I did not put a spinner on completing and postponing a review, the important mark, reordering the table of contents, or the translate button. They are immediate actions that are not "save or delete" in the rule, and they stay disabled as before. Translation already has the "translating…" notice.
- `서버 확인 중…` ("Checking the server…"), `PDF를 읽는 중…` ("Reading the PDF…"), and `번역하는 중…` ("Translating…") are notice sentences that tell what is going on, so I left them as they are.
- The `[role='status']` rule for screen messages (`style.css`) also gave the spinner a 16px top margin, which misaligned the icon and made the button bigger. I found it by measuring in the browser and removed the spinner's top margin.

## Verification

`npm run check` with `TEST_DATABASE_URL` set passed. Backend 338, frontend 129, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards.

With headless Chrome, I held back the API responses and checked the study log and statistics screens at PC 1440×900 and mobile 375×812. That is 32 items, including the skeleton and its name, the sentence for reading aloud, the spinner that spins only on the pressed button, the icon and text centers matching, no horizontal scroll, and disappearing after the response. I did not look at the other screens in a browser. The automated tests for the button spinner also cover only save and delete on the study log screen, and for the other 16 of the 18 buttons I only checked the name pairing by code review.

## Review

The first review found no functional defects. I only fixed that the verification paragraph above described the test scope of the spinner too broadly. The second review found no defects.

## Tests

- `frontend/src/loading.test.tsx`: `aria-busy` and the name of the area, the position of the sentence for reading aloud, the shape per kind, and the spinner that spins only on the pressed button on save and delete and disappears after completion.
- `frontend/src/reviews.test.tsx`: reflected the changed wording.
