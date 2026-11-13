# #23 Automatic table of contents generation (parsing pasted table of contents text)

- Issue: [#23](https://github.com/sirloinbh/study-log/issues/23) (parent #5)
- Branch: `feat/23-toc-paste`
- Prerequisite: #13 textbook table of contents (chapter and section hierarchy) DB and API (merged)

## Purpose

Instead of entering the table of contents one item at a time, paste the table of contents text of the book and register it all at once.

## Decisions

- User decision: the input methods are pasting text and extracting the table of contents from a PDF.
  - This PR covers only pasting text.
  - PDF extraction needs installing a PDF library. I go ahead separately after confirming again with the user which package and version to install.
- I set the parsing rules that were not decided as follows.
  - **One line is one item.** It skips blank lines, lines with only a page number, and a "목차/차례/Contents" ("Table of contents") line before the first item.
  - **Removing page numbers:** only a number after dotted leaders (`....`, `···`), a tab, or two or more spaces is treated as a page number. A number after one space, like "연습 3" ("Exercise 3"), stays as part of the title.
  - **Numbers and levels:** from the outer level in order, they are as follows.
    - Part: Part I, 제1부, 제1편
    - Chapter: Chapter 1, Ch. 1, Appendix A, 제1장, 1장, 부록 A
    - Section: 제1절, 1절
    - Decimal numbers: 1, 1.2, 1-2-3, A.1. Each time the number of pieces split by dots or hyphens grows by one, it goes one level deeper. So "1.1" goes both under "1" and under "Chapter 1".
    - Lines such as "A Tour of C++", "3D 그래픽" ("3D graphics"), and "2024년" ("year 2024") are not seen as numbers.
  - **A line with no number**
    - If it is indented more than the line just above, it goes under that line. A tab counts as 4 spaces, and a full-width space is also seen as indentation.
    - Otherwise it is placed at the same level as the nearest line with the same or shallower indentation.
    - If there is no line above to follow (a preface and so on), it is placed at the same level as the outermost numbers. So later chapters do not go under the preface.
  - **A line with only a number** ("Part II") uses the number as the title. A number over 20 characters stays in the title as it is.
  - **How to fix:** the preview is redrawn each time you edit the text. If a level is wrong, fix the number or the indentation. After saving, you can edit, move, and delete each item like the existing table of contents.
  - **Where it is saved:** if there is an existing table of contents, it is added after it. The existing table of contents is not changed.
  - **Limits:** 500 items at a time, 10 levels, and up to 50000 characters of text. The limits of 200 characters for a title and 20 characters for a number are the same as before.

## Changes

- `frontend/src/toc.ts` (a new file): the parser of the rules above.
  - `parseToc`: returns the level, number, title, and original line number of each item.
  - `tocProblems`: returns the problems that block saving, with line numbers.
  - `tocTree`: builds the tree for the preview.
- `backend/src/textbook-contents.ts`: `POST /api/textbooks/:id/contents/bulk` `{ entries: [{ level, number, title }] }`
  - Items are received flat in reading order. This is to validate deep input without recursion.
  - These cases are 400: the first item is not at the top level, it is two or more levels deeper than the item above, over 500, and over 10 levels
  - It inserts them all in the same transaction (the textbook row lock) as the existing writes. If it fails, none are left.
  - The response is the new table of contents tree (201).
- `frontend/src/TextbookContents.tsx`, `frontend/src/style.css`
  - Added a "목차 붙여넣기" ("Paste table of contents") button to the table of contents card.
  - The makeup of the paste window
    - The table of contents text input and the rules guide (`aria-describedby`)
    - A live preview tree: the item count, and "기존 목차 뒤에 추가" ("Add after the existing table of contents") if one exists. If it is long, it scrolls inside the preview.
    - The problem list (`role="alert"`)
    - A "N개 저장" ("Save N") button and a cancel button
  - If there are problems or no items, the save button is locked. If you open the add chapter or edit editor, the paste window closes.
  - When you save, it changes right away to the tree in the response. If the server rejects, it shows the message and leaves the text as it is.

## Tests

- `backend/test/toc.test.ts` (a new file): parser unit tests
  - Decimal, hyphen, and letter numbers, and removing page numbers (dotted leaders, a tab, a wide gap)
  - Part/chapter/section, English and Korean numbers, and lines with only a number
  - Indentation (spaces, tabs, full-width spaces), mixed with numbers, and a preface
  - Skipping the table of contents title line, blank lines, and page number lines, titles that look like numbers, a number after one space, and a too long number
  - Problems (200 characters, 10 levels, 500 items) and the preview tree
- `backend/test/textbook-contents.test.ts`
  - Validation 400 for bulk registration (no list, an empty list, a level missing, a decimal, or over, the first level, skipping a level, an empty title, and 501): it blocks before touching the DB.
  - 404 and rollback for a missing textbook
- `backend/test/textbook-contents-bulk.integration.test.ts` (a new file, a real DB)
  - It adds a 3-level table of contents after an existing chapter. It checks that the positions inside each parent are numbered 0, 1, 2.
  - The second paste goes after the first.
  - A wrong batch leaves nothing.
- `backend/test/textbook-contents-ui.test.ts`
  - The preview tree, the item count and "기존 목차 뒤에 추가", the preview changing when you edit the text, the bulk request body, and the tree and notice after saving
  - Save locked when there are problems, cancel, closing by add chapter, and the server rejection message and keeping the text

## Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 243, pass 225, fail 0, skipped 18 (DB) |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 010 applied | exit 0. tests 243, pass 243, fail 0, skipped 0               |

- Browser: I checked by starting the Vite dev server and this branch's API (a local Docker test DB) with Playwright (Chromium).
  - I made a textbook for the check, put in "0 머리말" ("0 Preface"), and went ahead, and deleted the textbook after checking.
  - Mobile 390×844
    - The pasted text: "목차", Chapter 1/2, page numbers with dotted leaders, a tab, and a wide gap, an indented "연습문제" ("Exercises"), and "부록 A" ("Appendix A")
    - The preview had 8 items, and "연습문제" went under 1.2. There was no horizontal scroll.
    - After "8개 저장", "목차 8개를 추가했습니다" ("Added 8 table of contents entries") appeared. The tree was saved with the same structure after "0 머리말", and the API response was the same.
  - PC 1440×900
    - Section 1 and section 2 went under chapter 3, and 3.2.1 under that.
    - The 201-character title line was shown as "6번째 줄: 제목이 200자를 넘습니다" ("Line 6: the title is over 200 characters") and the save button was locked.
  - Screenshots: [mobile 390×844 (preview)](assets/23-mobile-390x844.png), [PC 1440×900 (problem display)](assets/23-pc-1440x900.png)

## Limits and follow-up

- PDF table of contents extraction waits for the user's reconfirmation about installing a PDF library (the decision comment of issue #23).
- Roman numeral chapter numbers ("I. 서론", "I. Introduction") and parenthesized numbers ("(1)", "①") are not seen as numbers. Such lines follow the indentation.
- You cannot drag items to move them directly in the preview. Fix the text, or after saving, use the existing up/down and edit.
- If you paste text over 50000 characters, the input field cuts the part that goes over without a notice (the browser's `maxLength` behavior). It is far longer than the 500 item limit, so I leave it.

## Review

- First automated review (read-only, a separate agent): nothing to fix
  - Checked
    - Server: the position counter, the parent mapping, the transaction, and the superRefine boundary
    - Request size: the maximum input fits within the JSON 256kb
    - Parser: no skipping a level, no backtracking, and no misreading of numbers
    - Screen: state separation when switching textbooks, preventing duplicate submits, and accessibility
  - Notes below the reporting bar
    - A single line of tens of thousands of spaces could slow down the page number regular expression. It is not realistic input, so I leave it.
    - The 50000 character cut above
    - The wording "first line" in the document: I fixed it to "before the first item" to match the code.
  - There was nothing to fix, so I did not do a second review.

## PDF table of contents extraction (branch `feat/23-toc-pdf`)

### Decisions

- The user allowed installing `pdfjs-dist` ([decision comment](https://github.com/sirloinbh/study-log/issues/23#issuecomment-6360592804)).
- The PDF is not uploaded to the server and is read only in the browser. The text read goes into the existing paste field, and you fix it with the same preview and then save.
- If there are bookmarks (the outline), it brings the bookmarks in with indentation by level. If not, it brings the text of the first 20 pages by line, and the user deletes lines that are not the table of contents.
- A PDF over 50MB is not read. A PDF with no text, such as a scan, is reported as such (OCR is #29).

### Checks before installing (the global supply chain rule)

- `pdfjs-dist@6.4.299`
  - Published 2026-10-03, the publisher is GitHub Actions (with SLSA provenance)
  - The maintainers are the Mozilla pdf.js team, and the repository is `github.com/mozilla/pdf.js`
  - No install script
  - I pinned the version exactly and installed with `--ignore-scripts`.
- The optional dependency `@napi-rs/canvas` (a native module used only in Node)
  - The latest 1.0.13 in the range `^1.0.10` was published on 2026-10-21, so it is not 14 days old.
  - So I pinned it to 1.0.10 (published 2026-10-01) with `overrides`. For a workspace install, npm applies only the one in the root `package.json`. The one in `frontend/package.json` is for a standalone install of the sub-repository (`frontend/package-lock.json`, the Docker build).
  - The 11 platform binaries are also 1.0.10 and all are published by GitHub Actions. There is no install script.
  - The `child_process` in the loader `js-binding.js` is only the `ldd --version` call that tells musl on Linux. It does not go into the browser bundle.
- Lockfiles
  - Root: 13 added, no existing entry changed, all from `registry.npmjs.org`
  - `frontend/package-lock.json`: I rebuilt it in a temporary folder with `--package-lock-only --ignore-scripts`. The 13 added entries have the same versions and integrity as the root, and no line was removed.
- Security: it only reads text and does not draw. PDF.js 6 has no `eval` path, which was the cause of CVE-2024-4367. I confirmed there is no `eval` or `new Function` in the build output, including the worker.

### Changes

- `frontend/src/pdf-toc.ts` (a new file)
  - `outlineText`: turns the bookmarks into lines indented by 2 spaces.
  - `pageText`: regroups the text pieces of a page into lines. A baseline closer than half the font size is seen as the same line. A wide gap becomes two spaces so the page number is dropped, and the left margin is turned into indentation.
- `frontend/src/pdf-import.ts` (a new file): `readPdfToc`
  - It loads PDF.js and the worker dynamically on first use.
  - If there are bookmarks it reads the bookmarks, and if not it reads the text of the first 20 pages.
  - It closes the document when done.
- `frontend/src/TextbookContents.tsx`
  - I put a "PDF에서 가져오기" ("Import from PDF") file picker in the paste window.
  - While reading, "PDF를 읽는 중…" ("Reading the PDF…") is shown and the input and save are locked.
  - The result notice: N bookmark lines, or the first N pages. Failure, no text, and over 50MB are also reported.
  - It clears the picked value so you can pick the same file again.
- `frontend/src/vite-env.d.ts` (a new file): the Vite types for the `?url` import that gets the worker address
- `backend/test/ui-harness.ts`: I changed it to `mount(fetch, globals, modules)` so tests can pass package stand-ins (PDF.js) by name.
- Bundle
  - The main JS goes from 126.14 kB to 129.58 kB gzip (including the paste and parser code).
  - PDF.js (144.80 kB gzip) and the worker (1.26 MB) are separate files fetched only when you pick a PDF.

### Tests

- `backend/test/pdf-toc.test.ts` (a new file)
  - It turns bookmarks into indented lines, tidies spaces, and drops empty titles. The parser groups them by level.
  - It regroups scrambled text pieces into lines from top to bottom. It handles the page number gap, indentation, empty pieces, and empty pages.
- `backend/test/textbook-contents-ui.test.ts` (a PDF.js stand-in)
  - A PDF with bookmarks: replacing the field content, the worker address, the document closing, the preview, and the notice
  - A PDF with no bookmarks: the page text and the "first 2 pages" notice
  - A read failure (the document closes, text is kept), no text, and over 50MB (not read)

### Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 248, pass 230, fail 0, skipped 18 (DB) |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 010 applied | exit 0. tests 248, pass 248, fail 0, skipped 0               |

- Browser: I checked with the real PDF.js. I made a textbook for the check and used it, and deleted it afterward.
  - I wrote the 2 PDFs for the check directly with Python, with no package.
    - A PDF with 4 Korean bookmarks (UTF-16)
    - A PDF with no bookmarks that has a "Contents" page (Helvetica, page numbers at the right end, indented sections)
  - Mobile 390×844, the PDF with bookmarks
    - "1 벡터 / 1.1 벡터의 덧셈 / 1.2 내적 / 2 행렬" ("1 Vectors / 1.1 Vector addition / 1.2 Inner product / 2 Matrices") went into the field with indentation.
    - The preview had 4 items, and "PDF 책갈피에서 목차 4줄을 가져왔습니다" ("Imported 4 table of contents lines from the PDF bookmarks") was shown. There was no horizontal scroll.
  - PC 1440×900, the PDF with no bookmarks
    - "책갈피 목차가 없어 앞 1쪽의 글을 가져왔습니다" ("There was no bookmark table of contents, so I imported the text of the first page") was shown.
    - The "Contents" line and page numbers dropped out, and it was previewed as Chapter 1 [1.1, 1.2], Chapter 2 [Exercises].
    - When I saved, "목차 5개를 추가했습니다" ("Added 5 table of contents entries") was shown, and the API tree was the same.
  - Screenshots: [mobile 390×844 (bookmarks)](assets/23-pdf-mobile-390x844.png), [PC 1440×900 (no bookmarks)](assets/23-pdf-pc-1440x900.png)

### Limits

- The PDFs I checked are small files made by hand. Real textbook PDFs have varied text piece layouts, so without bookmarks the line grouping or indentation can be off. Then fix the text in the field.
- On a table of contents page in two columns, the lines of the two columns can mix.

### Review

- First automated review (read-only, a separate agent)
  - Comment: while reading the PDF, `busy` was not set, so the cancel, add chapter, and edit buttons were open.
    - If you cancelled while reading, a read that ended late reopened the paste window you had closed.
    - If you opened add chapter while reading, two forms opened together after it ended.
    - If you changed to another textbook, the input of the new textbook was locked.
  - Applied (commit "fix: drop a PDF read once the paste box closes")
    - I gave each read a number (`readSeq`). When you open the paste, cancel, add a chapter, or edit, the number changes, and the result that ends late is discarded.
    - The reading state is tied to the textbook ID, so it does not lock the input of another textbook.
    - "PDF를 읽는 중…" is announced in the always-present status area (`role="status"`). When you cancel, it is cleared together.
    - Screen test: I checked by holding back the open of the PDF.js stand-in.
      - The reading notice and the input lock
      - After cancel, the late result does not reopen the window
      - After add chapter, only the editor remains
      - The document is still closed
  - Items confirmed to have no problem: the `pageText` calculation (no division by zero), bookmarks null and cycles, closing the document, and the production worker address
  - Note: I corrected the explanation of the frontend `overrides` as above.
- After the fix, `npm run check`: exit 0. tests 249, pass 231, fail 0, skipped 18 (DB)
- Second automated review: nothing to fix
  - Checked: no stuck reading state, no notice for a late result, returning after switching textbooks, ref use during rendering (lint), and closing the document
  - Note: if you do up/down or delete while reading, the "Reading…" text changes to another notice. The input stays locked, so there is no effect on function.
  - The review is limited to 2 rounds, so I finish here.
