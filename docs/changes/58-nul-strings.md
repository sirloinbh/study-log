# #58 A NUL character in a string body is answered with 500

- Issue: [#58](https://github.com/sirloinbh/study-log/issues/58) (split from the PR #57 review)
- Branch: `fix/58-nul-strings`

## Problem

If a request string has a NUL character (U+0000), it passes the Zod validation. After that PostgreSQL rejects the text value (SQLSTATE `22021`), and the shared error handler answered 500 "서버 오류가 발생했습니다" ("A server error occurred") and wrote a server error log. A client input error was handled as a server error.

- Body strings: a textbook title, a study log note, exercise and answer bodies, keywords, and so on
- Search terms: keyword search `?q=%00` (a LIKE pattern parameter gets the same error)

## Changes

- `backend/src/app.ts`: in the shared error handler, answer `22021` with 400 "입력에 사용할 수 없는 문자(NUL)가 있습니다" ("The input has a character that cannot be used (NUL)"). It does not write a server error log.
  - It applies to all APIs at once: textbooks, table of contents, study logs, exercises, answers, and keywords.
  - Adding a NUL check to each Zod schema was another option. But there are many string fields and query parameters, so it is easy to miss one. So I handled it in one place, the point where the DB rejects it.
  - `22021` is the error for "a byte sequence that does not fit the encoding". The DB of this server is UTF-8, and the driver sends JS strings as UTF-8. So in practice only NUL causes it. I confirmed on a local PostgreSQL 17 that putting NUL in a parameter gives `22021` (for both a normal value and a LIKE pattern).

## Tests

- `backend/test/textbooks.test.ts`, `backend/test/study-logs.test.ts` (no DB)
  - Whether it answers with 400 and a Korean message when the DB throws `22021`
  - Whether `console.error` is not called
- `backend/test/nul-strings.integration.test.ts` (a real DB, a new file)
  - Whether a textbook title, a study log note, a keyword body, and the keyword search term `%00` all give 400 and the same message
  - Whether there is no server error log
- I confirmed that three tests fail on the code before the fix (only `app.ts` reverted) and pass after the fix.

## Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 155, pass 144, fail 0, skipped 11 (DB) |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 009 applied | exit 0. tests 155, pass 155, fail 0, skipped 0               |

- There was no screen change, so I did not check in a browser.

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no comments, so I do not do a second review. There is no issue to split off either.

- Confirmed points
  - Every route handles only the error codes it deals with (23503, 23505, and so on) and throws the rest again. So `22021` reaches the shared handler.
  - The transaction paths (`writeContents` in `textbook-contents.ts`, study log writes) throw again after ROLLBACK.
  - Path IDs are validated before the DB.
  - The test files have only an escape string that stands for U+0000, not a NUL byte.
  - The docs match the code.
- Note (kept): there is no NUL test that goes through the table of contents write transaction path. I confirmed in the code that it throws again the same way.

## Limits and follow-up

- A value with NUL is not saved and is rejected. If it got mixed in by pasting or the like, the user must delete it and send again. The screen does not filter it out in advance.
