# #450 Mark the Korean TOC parser and reword the paste hint

The central check (sirloinbh/project-standards#1129) fails on Korean outside comments in `frontend/src`. Rule (user decision 2026-11-27): Korean stays only where it is truly needed, marked with `korean-ok: <reason>`; plain screen text is English.

| File                                   | Change                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `frontend/src/toc.ts`                  | `korean-ok-file`: the parser recognizes Korean chapter, section and contents headings |
| `frontend/src/contents-paste-form.tsx` | The hint says "a Korean chapter heading" instead of quoting one                       |
