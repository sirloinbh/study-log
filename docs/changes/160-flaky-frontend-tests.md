# #160 Find the cause of the intermittent timeouts in the frontend tests

- Issue: [#160](https://github.com/sirloinbh/study-log/issues/160)
- Branch: `chore/160-flaky-frontend-tests`

## Purpose

`frontend/src/stats-review.test.tsx` and `frontend/src/app.test.tsx` sometimes failed in the full check and passed when run again (see the #34, #36, #117, #175, and #179 records). Measure the cause, and fix it to fit the cause.

## Measuring the cause

- On this PC (8 logical cores), when I run only the two files, even the tests that take long are short. `picking a period asks for its reviews too` 0.66 seconds, `saving a log and completing a review update the badge, and the pages stay mounted` 1.5 seconds, `each page has its own address and is marked in the main menu` 1.5 seconds.
- When I run the whole frontend test suite (32 files) once, the same tests become 3.5, 3.7, and 3.4 seconds. This is because vitest runs several jsdom workers at the same time.
- To create a situation where other work shares the PC, I ran 3 full runs at the same time. **All 3 times, `saving a log ...` in `app.test.tsx` failed with `Unable to find role="link" and name "오늘 복습 2개"`** (the same failure seen in #175). After saving a record, each step took over 1 second until the badge was counted again, and this file was using the default `findBy` wait of 1 second as it is. In the same run, `each page ...` took 7.9 to 9.5 seconds, close to the test limit of 15 seconds.
- I timed `picking a period ...` in `stats-review.test.tsx` step by step. Run alone, each step was 0.01 to 0.12 seconds. When run together with 2 full runs, the same step varied from 0.1 to 3.6 seconds (`findByText('75%')` 0.1 and 3.6 seconds, `getByRole('group')` 0.09 and 1.2 seconds). It is not that a specific lookup or chart loading is slow; the CPU is short, so any step stalls. `recharts` was already replaced with a mock in this file (#52).
- Conclusion: it is not a defect in the test code or the screen. When the PC is busy, the tests get much slower (based on `picking a period ...`, 0.66 seconds alone, 3.5 seconds in one full run, about 5 times, and up to 17.9 seconds with 3 full runs at once, about 27 times). `app.test.tsx` used the default wait of 1 second as it is, so it failed by going over that wait, and it was also close to the default limit of 15 seconds. The other 5 screen test files had raised the wait to 10 seconds and the limit to 20 seconds per file, so they failed less.
- `stats-review.test.tsx` already had a wait of 10 seconds and a limit of 20 seconds. The failure in #34 is recorded as going over the test limit of 20 seconds, not the `findBy` wait. The #179 record has only "timeout", but if it were a wait failure it would show as `Unable to find...`, so it looks like the same case. This PR does not actually change this file's settings and only moves the wait setting to `setup.ts`. The remaining risk is going over the limit of 20 seconds when it is very busy (see "Limits and follow-up" below).

## Changes

- `frontend/src/test/setup.ts`: with `configure({ asyncUtilTimeout: 10_000 })`, I raised the `findBy` and `waitFor` wait of all tests to 10 seconds. Once the element being waited for appears, it moves on right away, so passing tests do not get slower. Only failing tests fail later, and the test time limit still applies. There are no tests that deliberately wait for the wait to end (such as checking a `findBy` failure with `rejects`).
- I deleted the same setting that had been put in each file: `schedules.test.tsx`, `screens.test.tsx`, `stats-review.test.tsx`, `stats-textbook-filter.test.tsx`, and `textbook-stats.test.tsx`. I leave the test limit of 20 seconds as it is. I fixed the comment in `screens.test.tsx` to say the wait setting moved to `setup.ts`.
- `frontend/src/app.test.tsx`: it is a file that draws the whole app and opens seven screens in one test, so I raised the limit to 20 seconds like the other screen tests. I did not fix `frontend/vitest.config.ts` (limit 15 seconds) because it is a centrally managed file.
- `docs/next-steps/README.md`: removed the finished #160 from the candidates.

## Verification

- Before the fix: 3 full runs at the same time -> all 3 times, 1 failure (`saving a log ...` in `app.test.tsx`, the cause measurement above).
- After the fix, clearing the vitest cache (`frontend/node_modules/.vite`) and the same condition (3 full runs at the same time) -> all 3 times passed (32 files, 214 passed, 2 skipped, 0 failed). The tests that took long: `saving a log ...` 8.4 to 11.7 seconds, `each page ...` 10.4 to 11.1 seconds, `picking a period ...` 0.8 to 17.9 seconds.
- After the fix, running 2 full runs and the step-by-step timing file at the same time -> both full runs passed (214 passed, 2 skipped).
- `npm run check` (after clearing the cache, before writing the docs): passed (exit 0). Of 323 backend tests, 290 passed, 0 failed, 33 skipped. Frontend 32 files, 214 passed, 2 skipped (the dark-only app tests from the central standards). 4 skill tests passed. After writing the docs, `npm run format:check` passed.
- The 33 skipped in the backend are DB integration tests. I could not run them because there is no `TEST_DATABASE_URL` (#177, #178). This change only changes the frontend test settings.

## Limits and follow-up

- Under the extreme load of 3 full runs at once, `picking a period ...` took up to 17.9 seconds (limit 20 seconds). If it is busier than that, it can still fail. To reduce the load itself, the number of vitest workers must be reduced, but that is the job of the centrally managed file `frontend/vitest.config.ts` (adjusting `maxWorkers` or `pool`). In a normal full check this test takes about 4 seconds, so there is plenty of room, and I did not create a central repository issue. If it fails again when running several jobs at once, open an issue in `sirloinbh/project-standards`.
- I deleted the temporary test file used for the measurement (`frontend/src/zz-timing.test.tsx`).

## Review

The first review found no defects that had to be fixed. I checked whether the setting in `setup.ts` applies to all test files (`setupFiles`, a single copy of `@testing-library/dom`), whether any test depends on the 1 second wait (there are no fake timers, and a `waitFor` waiting for something to disappear ends right away when the condition is met), the imports left after deleting the settings, and whether any centrally managed file changed. I fixed the following document comments in this PR.

- I stated clearly that `stats-review.test.tsx` already had a wait of 10 seconds, so this PR changes nothing in that file.
- I replaced the unsupported "5 to 25 times" with the ratio of the times actually measured.
- I did not create a follow-up issue for adjusting the worker count, for the reason above, and left it in this record.

In the second review I confirmed that the three first-round comments were applied and that there are no defects in the code change. I fixed the following document comments. The review is limited to 2 rounds, so no further review.

- The item saying the temporary measurement file was deleted had been pushed below the "Review" section, so I moved it back to "Limits and follow-up".
- What `app.test.tsx` went over was only the 1 second wait, not the limit of 15 seconds, so I fixed the conclusion sentence to match.
- The #179 record has only "timeout", so I corrected that only #34 is confirmed to have gone over the 20 second limit.
