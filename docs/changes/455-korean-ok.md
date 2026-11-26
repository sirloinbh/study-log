# Mark the Korean TOC patterns and reword the paste hint (#455)

## Purpose

The central sync PR (#454) adds the "Korean screen text" check (project-standards#1129). It found 5 lines: the table-of-contents parser's Korean patterns in `toc.ts`, and the paste hint that spelled out the Korean chapter word.

## Changes

| File                                   | Change                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/toc.ts`                  | `korean-ok-file` with the reason: the parser has to recognise Korean chapter words and headings. The patterns are unchanged. |
| `frontend/src/contents-paste-form.tsx` | The hint says "Korean chapter numbers" instead of showing `제1장`.                                                           |

## Verification

See the PR.
