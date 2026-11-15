# #29 Decide how text is extracted from PDFs and photos

- Issue: [#29](https://github.com/sirloinbh/study-log/issues/29) (parent #5)
- Branch: `docs/29-ocr-method`

## Purpose

#30 extracts problems and answers from uploaded files (#28) and needs a method first.

## Decision

- User decision (2026-11-16, [comment](https://github.com/sirloinbh/study-log/issues/29#issuecomment-6901896902)): Claude reads the files, with no second `pdfjs-dist` path. Compared against the `pdfjs-dist` text layer, Tesseract.js, and other cloud OCR services.
- The detailed rules (when it runs, model, output shape, nothing saved without review) are in `docs/decisions/extraction-rules.md`.

## Changes

- `docs/decisions/extraction-rules.md` (new): the decision, the comparison, and the detailed rules for #30.
- `AGENTS.project.md`: lists the new rules document under the service rules.
- `docs/next-steps/README.md`: #29 is decided; #30 is next.

## Verification

- Docs only; no app code or tests changed.
- `npm run check` (2026-11-16, `TEST_DATABASE_URL` set to the Docker test DB): exit 0. Backend 435 passed, 0 skipped; frontend 223 passed, 2 skipped; other suites 4 passed.
- The sample-page accuracy comparison in the #29 scope was not run: no sample pages were available. #30 checks extraction on sample files.
