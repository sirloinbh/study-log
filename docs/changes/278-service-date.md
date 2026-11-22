# Compute the service date on the client and stop gating pages (#278)

## Purpose

An open tab kept yesterday's date after midnight, the review badge never refreshed then, and every page body was hidden when `/api/health` failed.

## Changes

| File                            | Change                                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/date.ts`          | New `serviceDate()` (Asia/Seoul), `msUntilMidnight()` and `useServiceDate()`, which updates at midnight and on focus or when the tab is shown                                           |
| `frontend/src/app.tsx`          | Pages get `today` from `useServiceDate()` and render without waiting for the health check; the app uses the shared `useHealth` from `health.ts`, which retries while the server is down |
| `frontend/src/review-badge.tsx` | Optional `day` prop: the count is fetched again when the service date changes                                                                                                           |
| `frontend/src/date.test.tsx`    | Unit tests for the date and midnight/focus, and a screen test that Reviews renders with a failing health check                                                                          |
| `frontend/src/app.test.tsx`     | The "server error" test now expects the alert and the page body                                                                                                                         |

## Verification

- `npm test -w frontend -- app.test date.test`: passed.
- `npm run check`: see the PR.
