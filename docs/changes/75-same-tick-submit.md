# #75 Block duplicate submits in the same tick with a progress flag that does not depend on rendering

- Issue: [#75](https://github.com/sirloinbh/study-log/issues/75) (split from the #73 review)
- Branch: `fix/75-same-tick-submit`

## Problem

The screens blocked duplicate requests with the `busy` value at render time (`if (busy) return`). If two submits came in the same tick before redrawing (rapid Enter presses and so on), both handlers saw `busy === false`. So two requests went out and the same item could be added twice.

## Changes

- `frontend/src/busy.ts` (new file): the `useBusy()` hook.
  - `busy` (state for showing the lock on buttons and inputs)
  - `begin()`: returns false if in progress. Otherwise turns on the progress flag and returns true. The progress flag is a `useRef` that does not depend on rendering, so it blocks the second call in the same tick too.
  - `end()`: turns off the progress flag and `busy`.
- Applied it to every screen that uses the `busy` pattern. `if (busy) return; setBusy(true)` became `if (!begin()) return`, and `setBusy(false)` became `end()`.
  - Screens the issue named: the table of contents card (`TextbookContents.tsx`) and the exercises card (`Exercises.tsx`)
  - Screens the issue asked to check: textbooks (`Textbooks.tsx`) and study logs (`StudyLogs.tsx`)
  - Screens changed together because they have the same pattern: the important exercises card (`ImportantExercises.tsx`) and the keywords screen (`Keywords.tsx`, add, edit, delete, and search)
- `backend/test/ui-harness.ts`: added `useRef` to the React stand-in for tests. It puts one object that persists between renders in the same slot as the state.

## Tests

- I added one test per screen to 5 screens that calls the rendered form's `onSubmit` twice before redrawing. Each checks that only one request goes out.
  - `exercises-ui.test.ts`: adding an exercise
  - `textbook-contents-ui.test.ts`: adding a chapter
  - `textbooks-ui.test.ts`: registering a textbook
  - `study-logs-ui.test.ts`: saving a study log
  - `keywords-ui.test.ts`: adding a keyword. The 409 error of the second request does not appear either.
- I confirmed that all 5 fail on the code before the fix (2 requests) and pass after the fix.

## Verification

| Command         | Environment                        | Result                                                       |
| --------------- | ---------------------------------- | ------------------------------------------------------------ |
| `npm run check` | Local, `TEST_DATABASE_URL` not set | exit 0. backend tests 173, pass 161, fail 0, skipped 12 (DB) |

- Browser (Playwright Chromium, 390×844): I called `form.requestSubmit()` twice in the same tick on the keyword input form.
  - POST went out once.
  - One keyword appeared in the list, and there was no 409 error.
- The look of the screen did not change, so I did not keep a screenshot.

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no comments, so I do not do a second review. There is no issue to split off either.

- Confirmed points
  - `end()` always runs after every `begin()`. `begin()` is right before the `try`, and calls that wait before `end()` in the `finally` catch errors inside.
  - There is no place left with `if (busy) return`. The remaining reads of `busy` are only the lock display and the focus effect.
  - Every handler that starts a request goes through `run` or `begin()`.
  - The test stand-in `useRef` uses the same slot as state, so the hook order is kept, and it is discarded with it when it leaves the screen.
  - React StrictMode does not run event handlers twice, so there is no effect.

## Limits and follow-up

- The order of responses between a reload sent by another card (for example the table of contents reload in #74) and the card's own change is not changed by this change. A narrow race remains where an old list that arrives late can overwrite the new list (see the reference note in the #74 review).
