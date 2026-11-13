# #56 The test helper fails intermittently when it gets a port that fetch forbids

- Issue: [#56](https://github.com/sirloinbh/study-log/issues/56)
- Branch: `fix/56-test-bad-port`

## Problem

`withApi` in `backend/test/helpers.ts` gets a random port with `listen(0)` and then calls it with `fetch`. When the operating system gave a port that the fetch standard forbids (6000, 6665 to 6669, 10080, and so on), the test sometimes failed with `TypeError: fetch failed — bad port` (seen locally on 2026-10-21).

## Changes

- `backend/test/helpers.ts`
  - `fetchBlockedPorts`: the 82 ports fetch rejects.
  - `openFetchablePort(open, tries = 10)`: opens a port, and if it is a forbidden port, closes it and opens again. If all 10 tries are forbidden ports, it raises an error.
  - `withApi` opens the server with this function. The calling style (`fetch`) and the test API are unchanged.
- I did not change the app code. Only the test helper changes.

## Checking the list

I checked directly with `fetch` on the local Node 24.21.0.

- All 82 ports in the list are rejected with "bad port" before connecting.
- Among ports 1 to 11000, no port that is rejected is missing from the list. The largest port in the list is 10080.

## Tests

- `backend/test/helpers.test.ts` (a new file, a fake listener)
  - Whether, after forbidden ports (6666, 10080), if it is given an allowed port, it uses the allowed port and closes the first two
  - Whether it opens only once if the first port is allowed
  - Whether it raises an error and closes everything if all of the set number of tries are forbidden ports
  - Whether the real `fetch` rejects every port in the list with "bad port" (before the first review fix, only 6666 was checked)
- The existing API and screen tests all go through the changed `withApi` and still pass.

## Verification

| Command                       | Environment                                                      | Result                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm run check`               | Local, `TEST_DATABASE_URL` not set                               | exit 0. backend tests 161, pass 149, fail 0, skipped 12 (DB) |
| `npm test` (default parallel) | Local Docker `postgres:17-alpine`, migrations 001 to 009 applied | exit 0. tests 161, pass 161, fail 0, skipped 0               |

- The original failure happens only when the operating system gives a forbidden port, so it cannot be reproduced. Instead I verified the port selection logic with a fake port order.
- There was no screen change, so I did not check in a browser.

## Automated code review, round 1

A separate read-only review agent reviewed it. There were no high or medium comments. There is no issue to split off either.

- Confirmed points
  - A rejected port is closed before opening again. Even if `run` fails, the server is closed.
  - The list matches the fetch standard.
  - The real fetch check is rejected before connecting, so it does not depend on the operating system.
- low (applied): the real fetch check was only 6666, so it would hardly catch a change in the list -> I widened it to check all 82 in the list.
- low (applied): if it could not get the address, it raised an error without closing the open server -> it now closes it and then raises the error. It is a case that does not happen with `listen(0, '127.0.0.1')`.

## Automated code review, round 2

A separate read-only review agent checked the first-round fixes and the whole final PR again. The review is limited to 2 rounds, so I do not do a third.

- The loop that checks the 82 in the list ends without connecting, so it is fast and does not depend on the operating system. Node is pinned to 24.21.0.
- The handling that closes the server when it cannot get the address is right.
- There were no comments and no issue to split off.

## Limits and follow-up

- The forbidden port list follows the fetch standard. If Node removes a port from the list, the test "whether the real fetch rejects every port in the list" fails and tells us. A case where Node adds a new port cannot be caught by the test.
