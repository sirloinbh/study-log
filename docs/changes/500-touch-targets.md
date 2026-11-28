# 500: Reach 44px touch targets for the coding checkbox label and the calendar days

Part of epic #468. Found in the touch re-measure after the #478 screen check.

## What changed

- `style.css` `.coding-checkbox label`: under `pointer: coarse` the label is `inline-flex` with `min-h-11`, so tapping the text is a 44px-high target (it was 142.5x19.5). The checkbox box already has a 44x44 area from the shared component.
- `calendar.tsx`: the day grid gets `max-sm:-mx-3`, so on screens narrower than 640px it uses 12px of the card padding on each side. At 390px the seven columns are 44px wide (they were 41px), with the 4px gap and no sideways scroll.
- The calendar edit was agreed with the coordinator for this card only (lane-3 owns the file).

## Checked

- Browser (Vite, mocked API, touch emulation with `pointer: coarse` true, 390x844): the label is 142x44, all 30 day cells are 44x52, the grid stays inside the card (x 29 to 361 in a card from 16 to 374), and the page has no horizontal overflow on History or Algorithms.
- Layout sizes cannot be measured in jsdom, so there is no unit test; the existing calendar and coding tests still pass.
