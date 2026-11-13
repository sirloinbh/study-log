# #179 Let the schedule name be edited on the screen

- Issue: [#179](https://github.com/sirloinbh/study-log/issues/179)
- Branch: `feat/179-schedule-rename`

## Purpose

After a schedule is created, only the name can be edited (chapter 6 of `docs/decisions/schedule-rules.md`), but only the API (`PUT /api/schedules/:id`) existed and there was no screen. On 2026-11-03, the user decided to build the screen.

## Changes

- `frontend/src/schedules.tsx`:
  - Put an "이름 수정" ("Edit name") button next to the title of the "날짜별 일정" ("Schedule by date") card. Pressing it shows the "새 일정 이름" ("New schedule name") input in place of the title and the "이름 저장" ("Save name") and "취소" ("Cancel", accessible name "이름 수정 취소") buttons. The names do not collide with "일정 이름" ("Schedule name") of the create form or "취소" of moving dates.
  - When you save, it changes the title and the name in the list right away with the schedule the server returned, announces "일정 이름을 바꿨습니다" ("The schedule name was changed"), and moves focus to the title. Even if the list cannot be read again, the name in the list changes. If you cancel, it sends nothing and goes back to the "이름 수정" button.
  - It trims leading and trailing spaces and validates, like the server. A name of only spaces is blocked before sending with "일정 이름을 입력하세요" ("Enter a schedule name"), and a name over 200 characters with "일정 이름 길이는 200자 이하여야 합니다" ("The schedule name must be 200 characters or fewer"). The input has no character limit (`maxLength`), so a long name is not silently cut.
  - This notice and the server's rejection are shown inside the form, right under the input, and linked to the input with `aria-invalid` and `aria-describedby`. They are kept separate from the notice of moving dates, so moving dates does not erase the name notice. The input and the value are left as they are.
  - A schedule deleted elsewhere (404) is reported on the list card and the form is closed.
  - If you pick another schedule, create a new schedule, or delete a schedule, the open name edit is closed.
- `frontend/src/style.css`: added the layout of the name edit form. On a narrow screen the buttons go below the input.

I did not change the backend or the DB. The server already validates the name's length and whitespace handling.

## Tests

I added eight `renaming a schedule (#179)` tests to `frontend/src/schedules.test.tsx`.

- Saving a new name sends one request, the title and the list change, and focus goes to the title.
- Even if the list cannot be read again after saving, the new name shows in the list.
- If you cancel, there is no request and focus goes back to the button.
- A name of only spaces and a 201-character name are blocked without a request. The notice is linked as the description of the input and disappears when you type again. Even if you enter 201 characters it is not cut, and a name that is 200 characters after trimming spaces is saved.
- A 400 rejection shows a notice inside the form and keeps the input and the value.
- A 404 is reported on the list card and focus moves to the "내 일정" ("My schedules") title.
- If you pick another schedule, the name edit closes, and it is still closed when you come back.
- If you open name edit and moving dates together, there is only one "취소" button. Even if you open moving dates, the name notice stays.

## Verification

- With headless Chrome (the DevTools protocol), I checked 24 items at PC 1440×900 and mobile 390×844 (run again after the review fixes). It includes the empty name notice being under the input and inside the card, and being linked to the input. I put one schedule into the test DB and started it with `npm run dev`.
  - I looked at the button, the input focus and the current name, the save notice, the change of the title and the list, and the title focus.
  - I saw that the name is kept after a refresh.
  - I confirmed there is no horizontal scroll, the form and buttons are inside the card, and the button height is 44px.
  - On mobile, I confirmed with a screenshot that a long name with spaces (about 70 characters) wraps in the title and the list.
  - After checking, I deleted the schedule I had put in. `schedules`, `holidays`, and `holiday_years` are all 0 rows.
- `npm run check` with `TEST_DATABASE_URL` set: passed (exit 0).
  - Backend 424 passed (0 skipped).
  - Frontend 206 passed, 2 skipped (the dark-only app tests from the central standards).
  - Skills 4 passed.
  - In the run before that, `picking a period asks for its reviews too` in `frontend/src/stats-review.test.tsx`, which is unrelated to this change, failed with a timeout (the same test as #160). Running only that file passed all 8, and running the full check again passed.
- `npm run standards:check` passed.

In the second review I confirmed that the four comments were applied and that the screen validation matches the server validation (1 to 200 characters after trimming spaces), and no defects remained. A point came up that sending a name of only spaces repeatedly does not read the same notice again, but it is the existing way, the same as the create form, so I did not fix it.
