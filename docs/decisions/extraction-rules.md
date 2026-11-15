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

- Extraction runs only when the user presses a button for one uploaded file, as translation (#31) does. Uploading a file never starts a paid call.
- The model is the one the user chose for translation, Claude Sonnet 5.5 (`claude-sonnet-5-5`), through the official SDK `@anthropic-ai/sdk` already in the backend. The key is the same `ANTHROPIC_API_KEY`; without it, only extraction fails, with a notice.
- The file is read from storage on the server and sent as is: a PDF as a document, a JPEG or PNG as an image.

## 3. What it returns

Detailed rules:

- The result is a list of problems, each with its number as printed, its text, and its answer when the file shows one. It comes back as structured JSON, the same way translation does.
- Formulas are written in LaTeX, and the text is kept in its original language. Translation stays a separate step (#31).
- The file content is material to read, never instructions to follow.
- Nothing is saved directly. The user reviews and edits the list, then saves it as exercises in one transaction (#30).
- A refusal, a cut-off output, or an unreadable result stores nothing and answers with an error, using the same status mapping as translation.
