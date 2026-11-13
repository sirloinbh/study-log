# #34 Study schedule DB and API

- Issue: [#34](https://github.com/sirloinbh/study-log/issues/34)
- Branch: `feat/34-schedules`
- Rules: chapters 1, 3, and 6 of the [study schedule rules](../decisions/schedule-rules.md)

## Purpose

Automatically create the target time for each date from the start date to the end date, and look up, edit, and delete schedules.

## Changes

- `database/migrations/015_schedules.sql`: `schedules`, `schedule_items`.
- `backend/src/schedules.ts`:
  - `plannedItems`: calculates items from the amounts for weekdays and for weekends and holidays. A day with an amount of 0 has no item.
  - `GET /api/schedules`, `GET /api/schedules/:id`, `POST /api/schedules`, `PUT /api/schedules/:id` (the name), `DELETE /api/schedules/:id`.
- `backend/src/app.ts`: connected the routes and added the `holidayFetcher` option.
- `backend/test/helpers.ts`: set the default lookup to fail so tests do not call the real holiday API.
- `docs/decisions/schedule-rules.md`: added chapter 5 (now chapter 6).

## Implementation judgment

What the agent decided because the issue did not say is written in rule chapter 6.

- An edit takes only the name. Changing the period or the amount would need reading the holidays again and creating the items anew, but rule chapter 3 says to use them only at creation, and the items that were completed or moved (#37) would disappear.
- The start date accepts only today or later. Past items are moved right away by the automatic pushing in #37.
- The period is at most 366 days. The years to look up do not exceed two.
- The end date is at most the end of next year. An empty year is not saved, so each request for a far future would call the API 12 times.
- The amount is an integer number of minutes. Converting the time input on the screen to minutes is done in #35.
- `HolidayError` is caught in the route and returns 503 and the message. If left to the global error handling, it would become a generic 500.

## Not confirmed

- There was no API key (#129), so I could not create a schedule with the real holiday API. While there is no key, schedule creation on the real server is rejected with 503. A year with saved holidays can be created, but the app DB has no saved holidays.
- When reading the holidays of both years for the first time, if the lookup runs to the time limit, the response can take up to 60 seconds. nginx's default response wait is also 60 seconds, so in this case the screen may show 504. The schedule is created after the holidays are read, so if the lookup fails, no schedule is left.
- I could not confirm when next year's holidays are published (#129). If you create a schedule that extends to next year before they are published, it is rejected with 503, and an empty year is not saved, so each retry calls 12 times.

## Review

The first review found no defects that had to be blocked, and I fixed the following.

- A false message such as "the period must be 366 days or less" came together with a wrong date. If the date is wrong, the period is not checked.
- If a schedule was deleted in another tab right after the name edit, a 200 with no body went out. It answers 404.
- Each request for a far-future year could call the holiday API. The review suggested splitting it out, but it is a problem tied to the key's call limit and the fix is small, so I fixed it here.
- The comment about the global error handling and the explanation in the document were not true to the facts.
- I added to the tests allowing 24 hours a day and the ID order of the same start date.

I deliberately broke the calculation and validation in 11 ways (swapping the amounts, removing the year limit, changing a boundary value, and so on), confirmed that the tests catch all, and reverted.

The second review also found no defects that had to be blocked. I applied only the comment that there was no test verifying the 404 fix above. I did not fix the following.

- If the schedule is deleted between the two queries of `loadSchedule`, it answers 200 with empty items. In a single-user app it is a millisecond window and no data is corrupted, so it is looked at together in #37, which wraps the lookup in a transaction.
- A message "a date that does not exist" comes together with a wrongly formatted date. It is a pattern in the date validation of the whole repository, so I split it into #159.

## Verification

`npm run check` with `TEST_DATABASE_URL` set passed. Backend 377, frontend 154, and skills 4 passed. The skips were 2 frontend tests, the dark-only app tests that came from the central standards. I applied migration 015 to the test DB. Only the API changed, so I did not check in a browser.

In the first run, 1 frontend `stats-review` test failed with a 20 second timeout, and passed in the next run with no code change. This PR did not change the frontend. The run times differed (42 seconds and 12 seconds), so I presume it was a delay of the first run with no cache, but I did not measure it.

## Tests

- `backend/test/schedules.test.ts`: the number of days in a period, the amount per kind of day, a day with an amount of 0, stopping at the last allowed date, and wrong input rejected with a Korean 400 before the DB and the holiday lookup.
- `backend/test/schedules.integration.test.ts`: creation and items, reusing saved holidays, the year boundary, rejecting a period with no items, the 366 day boundary, 24 hours a day, the end-of-next-year boundary, 503 and no schedule when holidays cannot be read, list and lookup, the name edit, deleting and deleting items, 404, and no schedule left when saving items fails.
