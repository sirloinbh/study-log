# 496: Show a way back when the log to edit does not exist

Part of epic #468. Found in the screen check after #478.

## What changed

- `StudyLogs` no longer shows the entry form when the log named by `editId` cannot be loaded (for example `/?edit=999`). It shows the error and a "Back to History" button, so a save cannot add a new log under an edit address.
- Test: `study-logs.test.tsx` renders `StudyLogs` with a missing `editId`: the error shows, there is no form or Save button, and the button ends the edit.
