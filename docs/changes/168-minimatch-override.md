# #168 Resolve the 16 npm audit findings caused by the minimatch vulnerability

- Issue: [#168](https://github.com/sirloinbh/study-log/issues/168)
- Branch: `chore/168-minimatch-override`

## Purpose

Remove the 16 moderate findings in `npm audit`. The cause is one denial of service vulnerability in `minimatch` 10.2.6 ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), before 11.0.1), and the other 15 spread through the ESLint family. It was not in the production dependencies.

## Changes

- `package.json`: added `minimatch` 11.0.3 to `overrides`.
- `package-lock.json`: `minimatch` changed to 11.0.3, and `@isaacs/nonrecursive-glob-match` 1.0.3 was newly added. Both come from `registry.npmjs.org` and have no install scripts.

The lockfiles of `frontend` and `backend` do not have `minimatch`, so they do not change. `.standards/manifest.json` does not manage this field, so it can be fixed in this repository.

## Implementation judgment

- This is an exception to the practice (#23, #49) of avoiding versions that are less than 14 days past publication. The fixed versions 11.0.1 to 11.0.3 were all published on 2026-10-27 to 28, and `@isaacs/nonrecursive-glob-match` 1.0.3 that came with them was also published on 2026-10-28. The user was told about this and installed it directly.
- The ESLint family requires `minimatch` `^10`, so I force it across the major version. If they officially support 11, remove the override.
- The user ran the package install with `--ignore-scripts`.

## Verification

- `npm audit`: 0 findings.
- `npm run check` with `TEST_DATABASE_URL` set: backend 422, frontend 201, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards.
- `npm run standards:check` passed, and the sub-lockfiles match the root.
- I checked with temporary files that lint does not silently stop, and deleted them. This is because ESLint uses `minimatch` to match `files` and `ignores` in the config.
  - `.ts` in `backend/src` and `frontend/src`: it caught `simple-import-sort/imports`, `@typescript-eslint/require-await`, `no-var`, and `@typescript-eslint/no-unused-vars`.
  - `.tsx`: it caught `react-hooks/exhaustive-deps` and `jsx-a11y-x/alt-text`.
  - I did not check the files in `frontend/dist`, the build output.
  - There were no new problems in the 192 files, excluding the temporary files.

I did not change app code, so I did not check in a browser. The changed packages are used only in development tools.

## Review

The first review found no behavior defects. `Minimatch`, `minimatch`, `match`, `dot`, and `flipNegate`, which the four ESLint family packages use, are unchanged in 11.0.3, and the removed APIs (`makeRe`, `AST`, and so on) are not used. I fixed the file count in the document and the missing publication date of the new package.
