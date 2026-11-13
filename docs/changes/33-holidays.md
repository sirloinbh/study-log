# #33 Korean holiday data and the weekday/holiday decision

- Issue: [#33](https://github.com/sirloinbh/study-log/issues/33)
- Branch: `feat/33-holidays`
- Rules: chapter 3 of the [study schedule rules](../decisions/schedule-rules.md)

## Purpose

Put the holiday lookup and the weekday, weekend, and holiday decision on the server, to use in the schedule amount calculation (#34).

## Changes

- `database/migrations/014_holidays.sql`: the lookup time per year (`holiday_years`) and the holidays (`holidays`).
- `backend/src/holidays.ts`:
  - `dayKind`: decides a date as a weekday, a weekend, or a holiday. A holiday that overlaps a weekend is a holiday.
  - `dataPortalHolidays`: looks up the Public Data Portal API 12 times per year.
  - `loadHolidays`: uses the saved holidays, and looks up again or rejects according to the rules.
- `compose.yaml`, `.env.example`: added `HOLIDAY_API_KEY`.

I did not make an API route. By the rules, holidays are used only when a schedule is created, so #34 calls `loadHolidays`.

## Not confirmed

There was no API key (#129), so **I could not call the real API.** The response interpretation is based on the item descriptions in the official documentation and the known response shape of this API. In particular, the following must be checked after the key is received.

- `_type=json`, which requests a JSON response, is not in the official documentation.
- Whether substitute holidays and temporary holidays come with `isHoliday: Y`.
- The `items` shape of a month with no holidays, and the shape of the key error response.

I read the response strictly, so a shape different from what is expected is handled as a lookup failure, and if there is no saved copy, schedule creation is rejected. But it is not complete. If a holiday in a month with no fixed holiday (February, April, July, September, November) is dropped as an empty response of the right shape, or a day that is really off comes with `isHoliday: N`, the code cannot find out. The Lunar New Year and Chuseok could fall here, so checking after receiving the key is a must. I wrote the procedure for the check in `docs/next-steps/README.md`. The issue's done criteria have no real call, so this PR closes #33, and the check is left to #129.

How to pass `HOLIDAY_API_KEY` to the production server is not decided. `compose.yaml` reads the value from the server `.env`.

## Implementation judgment

- The lookup failure message does not carry the cause. The request URL has the key, so it could leak into the error text.
- The portal gives the key both encoded and not encoded, so if there is a `%`, I send it as it is.
- When it cannot look up again and uses the saved copy, it does not change the lookup time, so it tries again at the next creation.
- The time limit is 30 seconds in total for the 12 requests of a year. This is because the schedule creation request is waiting.
- If two lookups overlap, the one that read first can save later. It is corrected at the next lookup, and the window is narrow, so I did not block it.
- Returning the 503 and message of `HolidayError` as the response is done in #34, which makes the route. The global error handling returns only 4xx as it is.

## Review

In the first review I found a big defect and fixed it. A normal-status response with no body was taken as a month with no holidays, so a year missing holidays could be saved and trusted for 7 days. What was fixed together is as follows.

- A mismatch between the count and the number of items, an empty `item` array, an unknown `isHoliday`, and a date from another month are treated as failures.
- A year missing a fixed holiday is treated as a failure.
- A reversed year range is rejected. If it returned an empty result, every day would be decided as a non-holiday.
- An unexpected failure is not recorded as "no holidays".
- I changed the time limit from 10 seconds per request to 30 seconds in total for a year.
- I wrote the key input for the production server in the user's tasks.

In the second review I found and fixed 3 more.

- `totalCount` was converted to a number, so `null` or an empty string became 0 and was read as an empty month. Only numbers and numeric strings are accepted.
- An empty `item` array that came with a count of 0 was read as an empty month. I reject it.
- The broken response test replaced May, so even if the schema was loose, the fixed holiday check blocked it in its place and the test passed. I moved it to February, which has no fixed holiday.

The review is limited to 2 rounds, so instead of a third review, I loosened the schema one thing at a time, confirmed that the tests catch it, and reverted.

## Verification

`npm run check` with `TEST_DATABASE_URL` set passed. Backend 358, frontend 154, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards. I applied migration 014 to the test DB. There was no screen change, so I did not check in a browser.

## Tests

- `backend/test/holidays.test.ts`: the decision including substitute holidays, the request format and key encoding, one item, several items, and an empty month, no key, the key not being in the message for an unreadable response, 20 kinds of broken responses are not read as an empty month, a missing fixed holiday, and a reversed year.
- `backend/test/holidays.integration.test.ts`: saving and reuse, replacing after 7 days, two holidays on the same date, using the saved copy on failure and on an empty result, and rejecting if there is no saved copy.
