# #229 Record the first real Claude extraction

- Issue: [#229](https://github.com/sirloinbh/study-log/issues/229)
- Branch: `docs/229-real-extraction`

## Purpose

The first real Claude extraction (#30) ran on 2026-11-17, but the docs still said no real call had been made.

## Changes

- `docs/changes/30-file-extraction.md`: the Limits line now points to a new "Real call" section with what came back and what is not covered.
- `docs/daily/2026-11-17.md` (new), listed in `docs/daily/README.md`.
- `docs/next-steps/README.md`: the first real call worked on sample pages; real scans and photos are not checked yet.

## Verification

- `npm run check` (2026-11-17, `TEST_DATABASE_URL` set to the Docker test DB): exit 0. Backend 444 passed, 0 skipped; frontend 234 passed, 2 skipped; other suites 4 passed.
- The recorded results are copied from the output the user pasted into the session; no values were rerun.

## Review

- Round 1 (self-review of the diff): two LaTeX examples in `docs/changes/30-file-extraction.md` were broken by shell escaping (`\times` became a tab, `\det` lost its backslash). Fixed to match the extractor output.
