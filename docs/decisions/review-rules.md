# Review interval rules

These are the rules the user set in issue [#41](https://github.com/sirloinbh/study-log/issues/41). The review issues #42 to #46 follow this document. All dates use the service time zone `Asia/Seoul`.

"User decision" is what the user chose, and "Detailed rules" is what the agent filled in so the decision can be implemented. A detailed rule can be changed in the implementing issue, and when it is, this document is updated too.

## 1. What gets a review

User decision: **Create reviews per study record.**

Detailed rules:

- When a study record's status changes from not completed to completed, or when it is newly registered as completed, create round 1. If a review already exists, do not create a new one.
- Do not create reviews retroactively for records that were already completed before the feature was added. An edit that leaves the status unchanged, such as editing a note, does not create a review.
- When you un-complete a record and no round has been completed yet, delete round 1. If you complete it again, create a new one from the study date at that time.
- If a round has been completed, keep the review as it is even when you un-complete the record.
- If you fix the study date before completing round 1, recalculate both the due date of round 1 and the original due date (chapter 3) from the new study date. Any earlier postponement is dropped too.
- When you delete a study record, its reviews are deleted too.

## 2. Base date and intervals

User decision: **The base is the completion date of the previous review, and the intervals are 1, 2, 4, 7, and 16 days.** If you review on time, the rounds fall on days 1, 3, 7, 14, and 30 after studying, the same schedule as issue #7.

| Round | Due date                          | Days after studying if reviewed on time |
| ----- | --------------------------------- | --------------------------------------- |
| 1     | study date + 1 day                | day 1                                   |
| 2     | round 1 completion date + 2 days  | day 3                                   |
| 3     | round 2 completion date + 4 days  | day 7                                   |
| 4     | round 3 completion date + 7 days  | day 14                                  |
| 5     | round 4 completion date + 16 days | day 30                                  |

Detailed rules:

- A study date is accepted up to 9999-12-31, so if a due date would go past that, set it to 9999-12-31. The due date can then equal the base date.
- The next round is created when the previous round is completed. Do not create all five rounds in advance. So #42 creates only round 1, and rounds 2 and later are created by the completion handling in #43.
- Completing a round is not undone. If you completed one by mistake, fix the date of the next round with the manual adjustment in #45.
- The study date is the date of the study record. If you complete a record from a few days ago later, round 1 can show up right away as an overdue review.
- A round that is not completed stays in the list even after its date passes.
- When you complete round 5, the reviews for that record are finished.
- The "remaining reviews" on the badge (#44) is the number of incomplete rounds whose due date is today or earlier. Next rounds scheduled for the future are not counted.

## 3. Postponing and late reviews

User decision: **Postponing moves only that round.**

Detailed rules:

- Postponing by one day changes the round's due date to the day after the later of the due date and today. A manual date change also changes only that round's due date.
- The next round is set from the completion date, so if you complete late after postponing, the next round is also that much later. Postponing itself does not feed into the next round's date calculation.
- The due date at the time the round is created is kept separately as the original due date. Lateness in the statistics (#46) is counted from the original due date (chapter 5), so postponing does not hide lateness.

## 4. Changing the intervals

User decision: **The intervals are fixed.** Do not build a settings feature. The date of an individual round can be changed with the manual adjustment in #45.

## 5. Completion rate statistics

User decision (#46, 2026-11-01):

- **Period:** A round counts toward a period if its original due date falls in that period. Postponing a round or changing its due date does not change the period it belongs to. As an exception, if you fix the study date before completing round 1, the original due date is recalculated too (chapter 1), so the period it belongs to can change.
- **Late:** A round that was completed later than its original due date, or whose original due date has passed and is not yet completed.
- **Completion rate:** completed ÷ due. A late completion still counts as completed. If due is 0, there is no completion rate.

Detailed rules:

- The periods are the same as the study time statistics: this week, this month, the last 3 months, and all time, and the end is today. Rounds scheduled for the future are not counted.
- An incomplete round whose original due date is today is included in due but is not late yet.
- The completion rate is rounded to a whole percent.
- A round completed earlier than due still belongs to the period of its original due date.
- The next round is created when the previous one is completed, so rounds after an incomplete round are not included in due.

## 6. Study type

User decision (#52, 2026-11-01): **When you write a study record, pick between new and review yourself.** The default is new, and all existing records start as new. The filter applies to the study time metrics and charts on the statistics screen.

Detailed rules:

- The type is a mark that splits study time. Completing a review round does not create a study record, and saving a record whose type is review does not complete a round.
- A record whose type is review also creates review round 1 when it is completed, as in chapter 1.
- When you pick a filter, even the total study time is calculated for that type. The review completion rate and the heatmap are independent of the filter.
- The start of the all-time period is the first record date of the chosen type. So the daily average for all time can divide by a different number of days for each type. The card shows the period too.
