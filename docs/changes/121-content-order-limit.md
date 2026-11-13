# #121 Add a length limit to the ids array for reordering contents

Issue: https://github.com/sirloinbh/study-log/issues/121

## Purpose

The zod 3 security advisory GHSA-mrhx-c7xc-m3w5 (high) says that validating an array with no length limit can exhaust memory. There is no fixed version of zod 3. In this app, the only array without a length limit was `ids` in reordering the table of contents (sirloinbh/project-standards#326).

## Changes

- `backend/src/textbook-contents.ts`: `orderLimit = 1000`, and `.max(orderLimit, '목차 순서는 한 번에 1000개까지 바꿀 수 있습니다')` on `ids` (the Korean message means "You can reorder up to 1000 contents at a time")
- `backend/test/textbook-contents.test.ts`: sending 1001 items gives `400` and the message above

The limit of 1000 is twice the limit for a table of contents pasted at once (500 items). I judged that one textbook would never have more entries at the same level than this.

## Verification

- `tsx --test test/textbook-contents.test.ts`: 4 passed
- Type-checked `textbook-contents.ts` with TypeScript `strict` and `NodeNext`: no errors
- Checked the two files with the shared ESLint and Prettier settings: no problems
- The `@sirloinbh/*` packages are not installed on this PC, so I could not run the whole `npm run check`. CI checks it.
