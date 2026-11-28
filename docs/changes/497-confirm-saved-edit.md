# 497: Confirm a saved edit on the History page

Part of epic #468. Found in the screen check after #478.

## What changed

- Saving an edit ends it with a status text: `StudyLogs` calls `onEditEnd('Updated')`. Cancelling or a log that is gone still calls `onEditEnd()` with nothing.
- The route glue passes the text to History as router state; `StudyHistory` shows it in its status line on arrival. The state is cleared right after (replace navigation), so a reload does not show it again.
- Test: `app.test.tsx` follows History → Edit → save and expects "Updated" as a status on History.
