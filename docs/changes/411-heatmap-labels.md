# #411 Use 13px labels in the heatmap and show fewer of them

Issue: https://github.com/sirloinbh/study-log/issues/411 (epic #259). Follows #406. User choice (2026-11-26, relayed by the coordinator, recorded on the issue): make the heatmap month and weekday labels 13px and show fewer so they still fit at 390px.

## Purpose

The heatmap's month and weekday labels were 10px, under the 13px rule; #406 left them because a bigger heatmap needs a design choice.

## Changes

- `frontend/src/heatmap.tsx`: month labels and weekday labels are 13px; the month row is 16px high (was 14px) so the larger text sits above the cells.
- The weekday column already named every other row (Mon, Wed, Fri) and a month is named only above the week holding its 1st (at least four weeks, about 56px, apart), so no further thinning was needed: 13px labels do not overlap.
- `frontend/src/stats.test.tsx`: only Mon, Wed and Fri are named, and no 10-12px class is left in the heatmap.

## Verification

- Browser check (Playwright, Vite dev, a full year of mock data): at 360, 390 (touch) and 1440px wide all labels compute to 13px, 12 month labels with no overlap, no overlapping weekday labels, and all month labels sit above the first cell row. The 390px screenshot shows labels and cells aligned.
- `npm run check`: see the PR.
