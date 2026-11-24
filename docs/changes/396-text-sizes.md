# #396 Use readable text sizes in text areas, labels, and badges

Issue: https://github.com/sirloinbh/study-log/issues/396 (epic #259). Found in the UX audit of 2026-11-24 (lane-4).

## Purpose

At 390x844 the audit found 16 text elements under 13px on the Study log screen, 13 on Coding and 6 on Schedules (field labels, hints, badges, calendar minutes, stats captions), and the textareas computed to 12px (below the 16px that stops iOS zooming on focus).

## Changes

- `frontend/src/style.css`: textareas inside `.legacy` are 16px, and 14px from the `md` breakpoint (the same as the shared `Input`); labels, hints, legends, memo preview headings and badges go from 11-12px to 13px.
- `calendar.tsx`, `stats.tsx`, `textbook-stats.tsx`, `study-goal.tsx`, `study-pattern.tsx`, `heatmap.tsx` (legend only): the same 11-12px to 13px change. The calendar's minutes label may now wrap instead of being clipped (a 36px cell at 360px wide clipped "45 min" at 13px).
- Left as is: the heatmap axis labels (10px, chart tick text), which are not body text.
- Test: `style-rules.test.ts` fails on any `text-[10-12px]` class in `style.css` and checks the textarea rule.

## Verification

- Browser check (Playwright, Vite dev, mocked `/api`): at 390x844 no text under 13px and no input under 16px on any of the 11 screens (before: 16, 6, 3, 6, 1, 13, 2 elements on 7 of them); no horizontal overflow. Calendar with 30 days of data: no clipped cell at 360, 390, or 1440px wide.
- `npm run check`: see the PR.
