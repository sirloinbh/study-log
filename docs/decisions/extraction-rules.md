# Text extraction rules

These are the rules for pulling problem and answer text out of uploaded files (#28). The user decided the method in issue [#29](https://github.com/sirloinbh/study-log/issues/29); #30 builds it.

"User decision" is what the user chose, and "Detailed rules" is what the agent filled in so the decision can be implemented. A detailed rule can be changed in the implementing issue, and when it is, this document is updated too.

## 1. Method

User decision (2026-11-16): **Claude reads the file.** There is no second path, such as the `pdfjs-dist` text layer, for PDFs that already contain text.

Options compared ([decision comment](https://github.com/sirloinbh/study-log/issues/29#issuecomment-6901896902)):

| Option                                                     | Scans and photos | Math and layout                                     | Splits into problems | New setup                            | Cost and privacy                     |
| ---------------------------------------------------------- | ---------------- | --------------------------------------------------- | -------------------- | ------------------------------------ | ------------------------------------ |
| **Claude (chosen)**                                        | Yes              | Good, can return LaTeX                              | Yes                  | None (same SDK and key as #31)       | Paid per call; pages go to Anthropic |
| `pdfjs-dist` text layer                                    | No               | Formulas come out jumbled                           | No                   | None (already installed for #23)     | Free, local                          |
| Tesseract.js                                               | Yes              | Weak on formulas and two-column pages; Korean so-so | No                   | New package and Korean language data | Free, local                          |
| Other cloud OCR (Google Vision, AWS Textract, Naver CLOVA) | Yes              | Plain text only                                     | No                   | New account, key and SDK             | Paid; pages go to that company       |

The sample-page accuracy comparison listed in #29 was not run: no sample pages were available, and the choice was made on the comparison above. #30 checks extraction on sample files.

## 2. When it runs

Detailed rules:

- User decision (2026-11-16, [#30 comment](https://github.com/sirloinbh/study-log/issues/30#issuecomment-6902994260)): on a chapter's exercises screen the user picks a PDF or photo and presses "Read file". The server sends it to Claude **without keeping it**, so no S3 bucket is needed. Attaching originals to each exercise (#28) stays a separate step.
- Nothing is read on its own: each reading is one button press, as translation (#31) is. While a file is being read for a chapter, a second request for the same chapter answers 409.
- The model is the one the user chose for translation, Claude Sonnet 5.5 (`claude-sonnet-5-5`), through the official SDK `@anthropic-ai/sdk` already in the backend. The key is the same `ANTHROPIC_API_KEY`; without it, only extraction fails, with a notice.
- The file is sent as is: a PDF as a document, a JPEG or PNG as an image. Its type comes from its first bytes, and it can be at most 20 MB, as for uploads (#28). The request needs the app's `X-Requested-With: study-log` header, as uploads do.
- The reply is streamed with room for 64,000 output tokens, enough for a chapter of problems. A file that holds more than 200 items, or more than fits, is refused with a message to upload fewer pages.

## 3. What it returns

Detailed rules:

- The user says what the file holds: **problems** (with answers when they are shown next to them) or **answers only** (for example the back of the book).
- The result is a list of items, each with its number as printed (cut to 20 characters), its problem text, and its answer when the file shows one. It comes back as structured JSON, the same way translation does. Problems without text, and answers without text in an answers-only file, are left out.
- Formulas are written in LaTeX, and the text is kept in its original language. Translation stays a separate step (#31).
- The file content is material to read, never instructions to follow.
- Nothing is saved directly. The user reviews the list, edits it, and unticks what to leave out, then saves the problems (with their answers) into the chapter in one transaction.
- User decision (2026-11-16): answers from an answers-only file go to the chapter's exercise with the same number. Numbers match ignoring spaces, case and a trailing dot, and only when exactly one exercise has that number; otherwise the answer starts as "Don't save". The user can move or drop each one; two answers cannot go to one exercise. Saving replaces an answer already there, all in one transaction, and answers 400 if any of those exercises left the chapter in the meantime.
- A refusal, a cut-off output, or an unreadable result stores nothing and answers with an error, using the same status mapping as translation.

## 4. Usage log

Each Claude call, from extraction and from translation, writes one JSON line (#245, ADR-0019 in `sirloinbh/project-standards`: no LLM gateway, each caller records its own calls). The code is `backend/src/claude-usage.ts`.

- A call that returned logs to stdout: `time`, `level: "info"` (`"error"`, on stderr, when `stop_reason` is `max_tokens` or `refusal`, because that reply was paid for but cannot be used, #268), `event: "claude_call"`, `requestId`, `feature` (`translation` or `extraction`), `model`, `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` (each `null` when `usage` lacks it), `stop_reason`, `ms`. It is logged as soon as the call returns, so a refusal or a cut-off reply also has its line.
- A call that threw logs to stderr: `level: "error"`, `event: "claude_call_failed"`, `feature`, `model`, `error_type` (the error class name), `status` (HTTP status, or `null`), `ms`. The error message is left out because an API error can echo part of the request.
- Prompt text, file content and answers are never logged.
- `requestId` is filled when the caller passes `requestId` in the translation or extraction source. The routes do not pass it yet, so for now the field is absent; matching the line to its request log line by time and feature works meanwhile.

## 5. Time budget and retries

Translation and extraction share one call helper, `backend/src/claude-call.ts` (#268). One request may take 240 seconds in all (`claudeBudgetMs`), enforced with an abort signal that also covers the streamed extraction reply; each attempt is limited to 110 seconds and there is one retry (the SDK default of two retries and unlimited streams could run for many minutes). The budget has to stay under the time the proxy in front waits for a reply. A call that runs out of time answers 504. Translation also refuses a problem or answer over 40,000 characters before calling Claude, and escapes a closing `</problem>` or `</answer>` tag inside the text so it cannot end the fence around the material.
