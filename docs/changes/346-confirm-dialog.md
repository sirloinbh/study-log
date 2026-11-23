# Use ConfirmDialog for the inline delete confirmations (#346)

## What changed

- New `frontend/src/delete-confirm.tsx`: a thin wrapper on the shared `ConfirmDialog` that tells the screen when the user backs out (Cancel, Escape) but not when the delete itself closes the dialog.
- Study logs, schedules, textbooks, contents entries, problems, keywords and retrospectives no longer swap their buttons for "Confirm delete / Cancel"; the Delete button stays and opens the dialog (button "Delete" in the dialog, spinner on it while the request runs).
- Screens no longer send focus to a confirm button; Radix returns focus to the Delete button on Cancel, and the screens' own focus steps (list heading, Delete button after a failure) are unchanged.
- Tests: the dialog is a modal, so the page behind it is hidden from the accessibility tree; delete flows wait for the dialog to close before reading the page. The focus recorders ignore the dialog's own focus moves. The schedules test that created a schedule while a confirmation was pending is gone (a modal makes that impossible).
- Not in this PR: the raw `<textarea>` swap (the shared `Textarea` has a soft `limit` instead of `maxLength`); it moves to #347 with the `.log-form textarea` CSS.

## Checked

- `npm run check`, `node .standards/check.mjs`; browser check at 390x844 and 1440x900 on the delete dialogs.
