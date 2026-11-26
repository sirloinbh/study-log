# 434: Make the 12-week rows readable on a phone

## What changed

- `frontend/src/twelve-week-view.tsx`: each row's stats column is two lines by design, the time and then "N of 7 days" (was "N/7 d"), with `whitespace-nowrap` so nothing wraps mid-value. The date column shows the year under the first row and wherever the year changes, and names the current week with "This week" (text, plus `aria-current="date"`).
- `frontend/src/week-view.test.tsx`: updated for the new text; new checks for the year on the first row, the year change across New Year, and the single current-week marker.

## Browser check (Vite dev server, mocked `/api`, Chrome)

- 390x844 and 1440x900: all 12 rows are 36px tall (two short lines each), no value wraps, no sideways overflow, the year shows on the first row and "This week" on the last.
