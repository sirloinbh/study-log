# Parse chapter lists correctly and show their hierarchy (#283)

## Purpose

Table-of-contents import read ordinary words as numbers, merged two-column PDF pages, and chapter dropdowns lost their indentation.

## Changes

| File                                | Change                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/toc.ts`               | The keyword needs a word boundary and a number, one letter or a capital roman numeral: "Chapters 1-3 Review" is a title |
| `frontend/src/pdf-toc.ts`           | Text pieces are split at a vertical gutter with real text on both sides, then grouped by y inside each column           |
| `frontend/src/textbook.ts`          | `contentOptions` indents with non-breaking spaces, which `<option>` text keeps                                          |
| `frontend/src/toc-keywords.test.ts` | Tests for the three words, numbered keywords, a two-column fixture, and the option labels                               |

## Verification

- `npm test -w frontend -- toc pdf`: 4 passed.
- `npm run check`: see the PR.
