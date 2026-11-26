# 446: Show English text on file fields instead of the browser's label

## What changed

- New `frontend/src/file-field.tsx`: a file field whose native `<input type="file">` is visually hidden (`sr-only`, still in the tab order and tied to its `<label htmlFor>`) and replaced by the shared Button "Choose file" plus the chosen file name or "No file chosen". The button shows the hidden input's keyboard focus ring. `file` is the screen's chosen file; when it goes back to undefined the input is emptied too. `clearAfterPick` empties the input right after a pick, for the PDF import that reads the file at once.
- Used by all four file fields: `coding-goals.tsx` (Excel file), `contents-paste-form.tsx` (Import from PDF), `exercise-extraction.tsx` (PDF or photo) and `exercise-feedback.tsx` (photo of a solution). Accept lists, size checks and handlers are unchanged. `coding-goals.tsx` lost its input ref, because the field clears itself.
- `frontend/src/file-field.test.tsx`: English text, accessible name and accept list on the native input, name shown after a pick and reset on clear, the button opens the file dialog. The existing screen tests (labels, accept, size limits, PDF re-pick) pass unchanged.

## Browser check (Vite dev server, Chrome started with `--lang=ko-KR` and locale ko-KR)

- 390x844 and 1440x900: the field reads "Excel file / Choose file / No file chosen", then the file name after a file is set; no Hangul and no sideways overflow. The field was loaded on a scratch page because the Coding page needs a full mock of its API.
