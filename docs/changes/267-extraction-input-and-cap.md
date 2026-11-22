# Check extraction input before paying and cap concurrent Claude calls (#267)

## Purpose

A reply that hit `max_tokens` or the 200-item limit was discarded after it was paid for, with no page check before the call. The per-chapter set stopped only a repeat for the same chapter, so different chapters (and translations) ran in parallel with no cap. Two comments said a second request "waits for the first", but the code answers 409.

## Changes

| File                                     | Change                                                                                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/pdf-pages.ts` (new)         | `countPdfPages`: counts `/Type /Page` objects in the file and in Flate-compressed object streams; undefined when it cannot tell                                                                             |
| `backend/src/exercises.ts`               | A PDF over 30 pages is refused with 400 before the extractor runs; extraction and translation take a slot from a shared gate and answer 503 (`Retry-After`) when none is free; the two comments now say 409 |
| `backend/src/claude-call.ts`             | `claudeSlots` and `maxConcurrentClaudeCalls` (3)                                                                                                                                                            |
| `backend/src/gate.ts` (new)              | `createGate`, moved out of `exercise-files.ts` so both limits share it                                                                                                                                      |
| `backend/test/extraction-limits.test.ts` | Page counting (plain, compressed, unreadable), an over-limit PDF gets 400 and the fake extractor is not called, cap + 1 extractions get one 503, translation shares the cap                                 |
| `docs/decisions/extraction-rules.md`     | Section 6 (limits before a paid call)                                                                                                                                                                       |

## Choices

- The limits (30 pages, 3 calls at once) are my defaults, one constant each.
- No PDF library is installed and installing needs the user's confirmation, so pages are counted from the bytes. It is a check before spending money, not a parser: an encrypted or unusual PDF is not page-checked. Adding `pdf-lib` later would make it exact (`countPdfPages` is the only place to change).
- The cap answers 503, not 429: it is the server's load, not one client's rate (the nginx rate limit already answers 429 per client).
- There is no daily budget; the card asked only for the concurrency cap.

## Verification

See the PR.
