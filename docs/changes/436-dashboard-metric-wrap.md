# 436: Stop the dashboard metric values wrapping on a phone

## What changed

- `frontend/src/stats.tsx` and `frontend/src/review-rate-chart.tsx`: metric values use `text-[20px] whitespace-nowrap sm:text-[26px]`, so they are 20px on a phone and keep 26px from 640px up, always on one line.
- `frontend/src/stats.test.tsx`: a test checks the classes on every metric value.

## Browser check (Vite dev server, `/api` mocked, Chrome)

- 390x844: the four values ("66 h 40 min", "3 h 15 min", "66 h 40 min", "57 min") are 20px and 30px tall (one line), with no sideways overflow.
- 1440x900: the same values are 26px and 39px tall (one line), no overflow.
