# #16 Write and render study notes in Markdown

- Issue: [#16](https://github.com/sirloinbh/study-log/issues/16) (parent #9)
- Branch: `feat/16-markdown-memo`
- Prerequisite: #11 study log input form and recent records list (merged)

## Purpose

Organize study notes in Markdown so they are easy to read. Even if a script gets mixed in, it must not run.

## Decision and library choice

- The user allowed installing `react-markdown` ([issue comment](https://github.com/sirloinbh/study-log/issues/16)).
- Candidates compared
  - `react-markdown`: it makes Markdown into React elements, not an HTML string. It does not need `dangerouslySetInnerHTML`, HTML in a note is shown as text, and dangerous addresses such as `javascript:` are cleared by default.
  - `marked`/`markdown-it`: they are smaller but make an HTML string. So you would have to install one more sanitizing library such as `DOMPurify` and insert it with `dangerouslySetInnerHTML`.
- Bundle size (measured with `vite build` on this branch): JS 292.84 kB (gzip 87.06 kB) -> 414.19 kB (gzip 126.14 kB). On a gzip basis it grew by 39 kB.

### Checks before installing (the global supply chain rule)

- Publisher and repository: `react-markdown@10.1.0` (published 2025-03). The maintainers are johno, wooorm, and remcohaszing. The repository is `github.com/remarkjs/react-markdown`.
- Install command: `npm install react-markdown@10.1.0 --save-exact --ignore-scripts -w frontend`. I pinned the version exactly and did not run the install scripts.
- Lockfile: 80 new packages were added. No existing package had its version changed or removed. No package has `hasInstallScript`, and all were fetched from `registry.npmjs.org`.
- Publication dates: all the added versions are older than 14 days. The most recent is `mdast-util-to-markdown@2.2.0` (2026-10-03). The 9 published since 2026-07 were uploaded by their usual maintainers: wooorm for the unified/micromark family, the DefinitelyTyped bot for `@types/hast`, and webreflection for `@ungap/structured-clone`.
- Code check: in the 79 new package folders I looked for the following and found none.
  - `child_process`, `process.env`, `.npmrc`, and token variables
  - Known leak addresses (webhook.site and so on)
  - `bundle.js`/`processor.js`/`data.json` in abnormal places
  - Install hooks

## Changes

- `frontend/src/Memo.tsx` (a new file): it draws a note with `react-markdown`.
  - Links open in a new tab (`target="_blank"`, `rel="noopener noreferrer"`). This is so you do not lose the form you are writing.
  - A link or image that was cleared because of a dangerous address leaves only text, with no `<a>`/`<img>`. It also blocks requesting the page again with an empty `src`.
  - With `clamp`, only the first few lines show for a list (the same role as the earlier 3-line cut).
- `frontend/src/StudyLogs.tsx`
  - I put a Markdown guide text (`aria-describedby`) under the note input.
  - If the note is not empty, it shows a "미리보기" ("Preview").
  - The recent records list draws the note in Markdown, but shows only the first part.
- `frontend/src/Calendar.tsx`: the date log draws the whole note in Markdown.
- `frontend/src/StudyLogSearch.tsx`: search results draw the note in Markdown, but show only the first part.
- `frontend/src/style.css`
  - `.memo` styles: headings are the body size, and the width of lists, code, quotes, and images
  - The preview and guide text styles
  - `.log-list li` -> `.log-list > li`: I found during the browser check that the card border was also applied to list items inside a note, and fixed it.
- Out of scope: the keyword note and the retrospective body stay as plain text.

## Tests

- `backend/test/markdown.test.ts` (a new file): it draws the real `Memo` component with `react-markdown` and `react-dom/server`.
  - Headings, lists, bold, code, and links are drawn, and the new tab attributes are attached to links.
  - The following HTML inputs do not become tags and stay as escaped text: `<script>`, `<img onerror>`, `<a href="javascript:">`, `<iframe>`, and event attributes
  - Links and images with the following addresses leave only text with no `href`/`src`: `javascript:` (including mixed case), `vbscript:`, `data:`, and the autolink `<javascript:…>`
  - A safe image is shown as it is.
- `backend/test/study-logs-ui.test.ts`
  - The list passes the note to the Markdown renderer and shows only the first part.
  - The preview shows while writing, and does not show for an empty note or a note of only spaces.
- `backend/test/ui-harness.ts`: it replaces `react-markdown` with a `markdown` element that holds the raw text. The test above covers the real rendering.

## Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 234, pass 217, fail 0, skipped 17 (DB) |
| `vite build` size comparison  | Local, before and after the change                               | gzip 87.06 kB -> 126.14 kB                                   |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 010 applied | exit 0. tests 234, pass 234, fail 0, skipped 0               |

- Browser: I checked by starting the Vite dev server and the local API (the Docker test DB) with Playwright (Chromium).
  - Mobile 390×844
    - I entered a note that has the following elements: a heading, a list, bold, code, a quote, a link, `<script>alert('xss')</script>`, and `[위험](javascript:alert(1))` ("[dangerous](<javascript:alert(1)>)")
    - Preview: the elements were drawn as Markdown. The script stayed as the text `&lt;script&gt;`, and the dangerous link stayed only as the text "위험" ("dangerous").
    - After saving: the note in the list was cut at 87px. There was no `<script>` element on the screen, and the intercepted `alert` was not called either. There was no horizontal scroll.
  - PC 1440×900: the whole note was drawn in the calendar log.
    - At first the card border was applied to the list items. I checked again after fixing the CSS.
    - The `.log-list` items on the textbook, keyword, retrospective, and study log screens are all direct children. So the selector change does not affect other screens.
  - Screenshots: [mobile 390×844 (writing preview)](assets/16-mobile-390x844.png), [PC 1440×900 (calendar log)](assets/16-pc-1440x900.png)

## Limits and follow-up

- It supports only CommonMark. GFM syntax such as tables, strikethrough, and task lists needs installing `remark-gfm`, so I left it out of this scope (a new package install needs the user's confirmation).
- The bundle grew by 39 kB gzip. If needed, the note renderer can be split with lazy loading (`React.lazy`). But the test harness does not support Suspense, so I did not do it this time.
- External image addresses are loaded as they are. Whether to block images is a separate decision.

## Review

### First automated review (read-only, a separate agent)

- Comment: Markdown folds a single line break (Enter) inside a paragraph into a space. Before, lines looked split because of `pre-wrap` on `.log-memo`, so existing notes look merged into one line.
  - Applied (commit "fix: keep single line breaks in markdown memos")
    - `.memo p { white-space: pre-line; }`: shows line breaks inside a paragraph as they are. If I put it on all of `.memo`, newlines between blocks would become blank lines, so I put it only on `p`. I did not use the line break plugin (`remark-breaks`) because it is a new package.
    - `markdown.test.ts`: it checks that `1줄\n2줄` ("Line 1\nLine 2") keeps the line break inside one paragraph as it is.
    - Browser: in the mobile 390×844 preview, three lines split with Enter show as three lines (60px).
- Items confirmed to have no problem: the XSS paths, the CSS selector change, the dynamic import in the backend tests, skipping in a repository with no frontend, accessibility, and the accuracy of the docs
- Note: the cut in the list is based on height (`max-height`), not the number of lines, so there is no ellipsis (a minor design point).
- After the fix, `npm run check`: exit 0. tests 234, pass 217, fail 0, skipped 17 (DB)

### Second automated review

- Comment: a hard break (2 spaces at the end of a line or `\`) is drawn as `<br>` and a newline character. Because of the `pre-line` I put in the first round, this newline breaks the line once more and a blank line appears. I drew the output `줄1<br/>\n줄2` ("Line 1<br/>\nLine 2") directly and checked.
  - Applied (commit "fix: one line break for a markdown hard break"): I put a small rehype plugin (`singleBreaks`) in `Memo.tsx` that removes the newline right after `<br>`. I did not use a new package.
  - `markdown.test.ts`: it checks that both kinds of hard break become `<p>1줄<br/>2줄</p>`.
- Items confirmed to have no problem
  - `<li><p>` in a loose list, headings, a paragraph inside a quote, and `pre code` are not affected by `pre-line` or keep their lines as intended.
  - Consecutive spaces in inline code fold into one, but the effect is small.
- Limit: a single line break inside a tight list item has no `<p>`, so it folds into a space. It is the Markdown standard behavior.
- The review is limited to 2 rounds, so I do not do a third.
- After the fix, `npm run check`: exit 0. tests 234, pass 217, fail 0, skipped 17 (DB)

### CI failure and fix

- `docker-build` of the final head (16457f3) failed. The new package was missing from `frontend/package-lock.json`, which is for building the sub-repository on its own, so `npm ci` stopped with "Missing: react-markdown@10.1.0 from lock file".
- Fix (commit "fix: add react-markdown to the frontend lock file")
  - I copied `frontend/package.json` and `package-lock.json` to a temporary folder outside the work folder.
  - In that folder, I rebuilt only the lockfile with `npm install --package-lock-only --ignore-scripts`. It does not create `node_modules` and does not run package code.
  - I wrote it again keeping the original indentation (4 spaces). The existing entries are as they were, except that `react-markdown` was added to the dependency list and the `"dev": true` of `@types/react`, `@types/estree`, and `csstype`, which production dependencies now use, was removed.
  - The 82 newly added entries all have the same versions and integrity as the root lockfile checked above. There are no changes to existing entries and no install scripts.
