# 272: Port the backend-hosted screen tests to Vitest

## What changed

- The nine `backend/test/*-ui.test.ts` files (163 tests) now run in the frontend as `frontend/src/*.test.tsx` with real React and Testing Library: calendar, exercises, keywords, retrospectives, stats, study-log-search, study-logs, textbook-contents, textbooks. Test names are unchanged and every case was ported (163 of 163).
- `toc`, `pdf-toc` and `markdown` tests moved to `frontend/src/` too, because they used the harness's module loader.
- Deleted `backend/test/ui-harness.ts` (fake React in `node:vm`) and `backend/test/ui-shell.ts`.
- `backend/test` has no `*-ui.test.ts` files left. Textbook edit, cancel-with-draft, two-step delete, 404 and focus paths are covered in `textbooks.test.tsx`.

## Intent changes while porting

- Focus tests check the real `document.activeElement` (or a `focus` spy) instead of a fake `getElementById`.
- Pages are rendered directly, not through the legacy shell, so the default date comes from the `today` prop.
- Chart load failure in `stats.test.tsx` asserts `Could not load the chart:` because Vitest wraps the mock error.
- One short fixed wait remains in `stats.test.tsx` for a negative check (slow answer for a previous period); #277 removes sleeps.
- Each file has a local fetch fake; #277 moves them into `test/fake-api.ts`.

## Checked

- `npm run check` (see the PR for the result).
