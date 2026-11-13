# #151 Move the backend validation code to zod 4 syntax

- Issue: [#151](https://github.com/sirloinbh/study-log/issues/151)
- Branch: `chore/151-zod4-syntax`

## Purpose

It is step 1 of central `sirloinbh/project-standards#386`. I move the code first so this app does not break when the central repository raises `zod` to 4.6.7. The Dependabot alert for the security advisory GHSA-mrhx-c7xc-m3w5 is closed by that sync. It is not closed by this PR alone.

## Changes (2026-11-01)

- The 11 zod files in `backend/src` import from `zod/v4`. The installed 3.25.76 contains this path, so I did not change the package version or the lockfile.
- I moved `required_error`, `invalid_type_error`, and `errorMap` to `error`. Where the two messages differ, I use `missingOrInvalid` in `backend/src/validation.ts`.
- I changed the string length checks `.min()` and `.max()` to `.refine()`. The length check of zod 4 also runs on an array that failed the type check, so the message gets appended, and `.max()` in 4.6.7 counts by code point, not by UTF-16 unit.
- I also changed the array `.min(1)` to `.refine()`. I left the array `.max()` as it is and put it first. 4.6.7 rejects before reading the elements only when there is no other check before `.max()`.
- I put Korean messages on `textbookId` and `contentId`, where a repeated query value went out with zod's default English text.
- `backend/test/zod4-validation.test.ts`: it checks the defaults, the messages for a missing value and a wrong type, and the array length limit.

## Implementation judgment

- Every `.default()` is at the end of a schema, and there is no `.partial()` or `.default().optional()`. There is no default with a `.transform()` after it. I did not change any default.
- `z.record` is not in this app. Inputs that are a problem in `z.record` of 3.25.76, such as `{"constructor":null}`, do not apply, and no 500 appeared in the comparison either.
- I do not use the forms `.merge()`, `ZodError.errors`, or `z.string().email()` either.
- I left `.int()` as it is. To remove the differences 1 and 2 below, every integer check would have to change to `.refine()`, but only the duplicated message of a wrong request differs, so I did not change it.

## Responses that change

I sent the same 18,148 requests to the state before the switch (zod 3), `zod/v4` of 3.25.76, and `zod/v4` of 4.6.7 and compared. For the DB I used a fake pool that records the values passed.

| Comparison        | Status code differs | Value passed to the DB differs | Error message differs |
| ----------------- | ------------------: | -----------------------------: | --------------------: |
| Before -> 3.25.76 |                   0 |                              0 |                 2,055 |
| 3.25.76 -> 4.6.7  |                   0 |                              0 |                   168 |
| Before -> 4.6.7   |                   0 |                              0 |                 1,895 |

For the 840 successful requests, the status code and DB value were all the same. The requests whose message differs were all 400 before too, and most are inputs for comparison that mix two or more wrong fields. The differences compared with before the switch are as follows.

|   # | Example input                                                                              | Before                                                                                                             | After                                                                                                                                                                           |
| --: | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | `limit=0.5`, `understanding: 0.5`                                                          | Both the integer message and the range message (twice if the message is the same)                                  | Only the integer message                                                                                                                                                        |
|   2 | `limit=1e20`, `textbookId: 1e20`                                                           | Only the range message                                                                                             | Both the integer message and the range message                                                                                                                                  |
|   3 | `limit=1e400` (Infinity)                                                                   | Both the integer message and the range message                                                                     | Only the type message (the same text as the integer message)                                                                                                                    |
|   4 | `contentId: 0.5` with `textbookId: null`, `ids: [0.5, 0.5]`                                | The field message and the cross-check message                                                                      | Only the field message                                                                                                                                                          |
|   5 | `from=abc&to=2026-01-15`                                                                   | The format message and `시작일은 종료일보다 늦을 수 없습니다` ("The start date cannot be later than the end date") | 3.25.76: only the format message. 4.6.7: the same as before                                                                                                                     |
|   6 | A string longer than the limit, or an object with a large `length`, in `ids` and `entries` | Only the type message                                                                                              | The type message and the count limit message                                                                                                                                    |
|   7 | `textbookId=1&textbookId=2`, `contentId=1&contentId=2`                                     | `Expected string, received array`                                                                                  | `교재 ID가 올바르지 않습니다` ("The textbook ID is not valid"), `목차 ID가 올바르지 않습니다` ("The table of contents ID is not valid")                                         |
|   8 | An array over the limit                                                                    | The count limit message, then the element or cross-check message                                                   | 3.25.76: the same as before if all elements are valid, and if there is a wrong element, the count limit message after the element messages. 4.6.7: only the count limit message |

I put all the differences from before the switch in the table above, split by kind. Only number 7 is an intended change from English to Korean, and the rest leave the behavior differences of zod 4 as they are. For the 265 requests with `constructor` and `__proto__` keys, the status codes and messages were all the same in the three versions.

## Verification

- `npm run check`: passed. Of 292 backend tests, 265 passed and 27 were skipped, of 125 frontend tests, 123 passed and 2 were skipped, and 4 skill tests passed. I ran it with `TEST_DATABASE_URL` empty, so the DB integration tests were skipped, and the PR CI checks them.
- In one earlier run, `frontend/src/stats-review.test.tsx` failed by going over the 5 second limit. I did not change the frontend, and it passed in a re-run of `npm run check`.
- `npm run standards:check`: passed.
- For 4.6.7, I compared only the HTTP responses with the copy at `node_modules/knip/node_modules/zod`. I could not run the whole test suite and the type check with 4.6.7, and I check that with the CI of the central sync PR.
