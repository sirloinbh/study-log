# #32, #41 Fix the study schedule and review interval rules

- Issues: [#32](https://github.com/sirloinbh/study-log/issues/32), [#41](https://github.com/sirloinbh/study-log/issues/41)
- Branch: `docs/32-41-schedule-review-rules`

## Purpose

Ask the user about the undecided rules that were blocking the implementation of schedules (#33 to #38) and reviews (#42 to #46), and record them (2026-10-31).

## Changes

- `docs/decisions/schedule-rules.md`: rules for the amount of time, chapter allocation, the holiday source, and handling delays.
- `docs/decisions/review-rules.md`: rules for what gets a review, the base date and intervals, postponing, and changing the intervals.
- `AGENTS.project.md`: put links to the two documents in "Service rules".

The two documents separate the user's decisions from the detailed rules the agent filled in.

## Points from the decision process

- In the first question, I explained "move only that round" as the next round's date staying the same, but combined with the "completion date of the previous review" base, it does not work that way. The next round is set from the completion date, so if you complete late, it is later too. The document describes the actual behavior.
- If 1, 3, 7, 14, and 30 were used as they are as intervals from the completion date, the last round would be 55 days after studying. I asked the user again and set the intervals to 1, 2, 4, 7, and 16 days.

## Verification

I did not change app code, so I did not add tests.

- `npm run test:skills`: 4 passed.
- I aligned the new documents with the local Prettier without project settings.
- I could not run `npm run format:check`, `npm run lint`, and `npm run standards:check` to the end locally. The local `node_modules` does not have the shared `@sirloinbh/*` packages, and installing packages needs the user's confirmation. These checks are confirmed with the CI result.

## Review

In the first review there were no recording errors in the user's decisions, and the following comments came on the detailed rules the agent filled in, and I fixed them in this PR.

- The boundary comparison for chapter allocation and the start date of the next chapter were not set, so the last chapter might not end. I wrote `cumulative × n ≥ T × k` and the start date rule, and set the cases of 0 chapters and an amount of 0.
- The "one item per day from today" rearrangement of automatic pushing pulled items earlier, overlapped dates with completed items, and erased manual moves. I changed it to a rule that pushes all incomplete items by the same number of days.
- Recalculating the target time of pushed items broke the total target time and the time-proportional allocation. I changed it to leave them as they are. So holiday data is no longer needed at read time, and it is used only at creation.
- For reviews, I set un-completing, fixing the study date, existing completed records, undoing a round completion, the badge criterion, and the basis of the late count.
- The record in the issue comments was missing. I leave the decisions as comments on #32 and #41, which are in the done criteria.

In the second review, the following comments came, and I fixed them in this PR. The review is limited to 2 rounds, so I did not do a third review.

- When recalculating round 1 after fixing the study date, I set it to change the original due date too. Otherwise a review on time would be counted as late.
- I widened the condition for rejecting creation from "both amounts are 0" to "the target time for the whole period is 0". It blocks cases with no items, such as a Monday to Friday period with 0 hours on weekdays.
- I set that an empty successful response from the holiday API is not saved as a year with no holidays.

## Follow-up work

The comments I meant to leave on the affected issues (#33, #37, #42 to #46) were blocked by the automatic permission check and could not be left yet. I also could not add the `needs-user` label to #33. Each issue follows this document and `docs/decisions/` when it starts.

- #33: a Public Data Portal API key is needed (a user step).
- #37: add automatic pushing to the scope.
- #42, #43: create only round 1 first, and create the next round in the completion handling.
- #44: count only incomplete rounds whose due date is today or earlier.
- #45: postponing changes only that round's due date.
- #46: count lateness from the original due date.
