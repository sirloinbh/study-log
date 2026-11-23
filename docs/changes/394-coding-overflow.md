# #394 Stop the Coding screen scrolling sideways on phones

Issue: https://github.com/sirloinbh/study-log/issues/394 (epic #259). Found in the UX audit of 2026-11-24 (lane-4).

## Purpose

At 390px wide the Coding screen was wider than the viewport (`scrollWidth` > `innerWidth`): the two import buttons sat in `.actions`, which did not wrap, so the second button ended at x=502.

## Changes

- `frontend/src/style.css`: `.actions` now wraps (merged with `.log-actions`, which already did).
- `frontend/src/test/style-rules.ts` (new helper) and `frontend/src/style-rules.test.ts`: jsdom does not load the CSS, so layout rules are checked on the rule text. Later accessibility rules (#395, #396) use the same helper.

## Verification

- Browser check with Playwright (installed Chrome, Vite dev server, mocked `/api`, empty data): `/coding` at 390x844 `scrollWidth` 390 (was wider); at 1440x900 no overflow. The other 10 screens had no overflow before and none after.
- `npm test -w frontend -- style-rules`, `npm run check`: see the PR.
