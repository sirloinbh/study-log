# Translate past records in docs to English (#195)

- Issue: [#195](https://github.com/sirloinbh/study-log/issues/195) (tracking: sirloinbh/project-standards#487)
- Branch: `docs/195-english-records`

## Purpose

The user asked on 2026-11-12 that every markdown file in every project be English. This change translates the past records in `docs/changes/` and `docs/daily/` (82 files). There are no files in `docs/adr/` in this repository.

## Changes

- Translated every Korean record in `docs/changes/` and `docs/daily/` to English, including the two `README.md` indexes.
- Kept the structure, headings order, tables, code blocks, commands, file paths, identifiers, issue and PR numbers, commit hashes, and dates.
- Image links keep their file names; their alt text is translated.

## Kept in Korean

Quoted text that the code or the screen shows is kept as written, with an English gloss next to it: UI labels, button names, Korean validation and error messages, and Korean test input. Korean test names and fixtures were not changed because no code was changed.

## Verification

- `node node_modules/prettier/bin/prettier.cjs --check docs`
- A Hangul search over `docs/changes/` and `docs/daily/` returns only the quoted UI and message text described above.
