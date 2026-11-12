# Study schedule rules

These are the rules the user set in issue [#32](https://github.com/sirloinbh/study-log/issues/32). The schedule issues #33 to #38 follow this document. All dates use the service time zone `Asia/Seoul`.

"User decision" is what the user chose, and "Detailed rules" is what the agent filled in so the decision can be implemented. A detailed rule can be changed in the implementing issue, and when it is, this document is updated too.

## 1. Amount of time

User decision: **Edit it for each schedule.**

Detailed rules:

- The schedule creation screen is pre-filled with 2 hours for weekdays and 5 hours for weekends and holidays.
- The amount you enter is saved with that schedule. Do not create a separate global setting.
- The amount is 0 to 24 hours per day. If the target time for the whole period is 0 after holidays are determined, that is, if no day gets an item, reject the creation.
- Do not create items on the kind of day whose amount is 0. For example, if you set weekdays to 0, items are created only on weekends and holidays.
- If the defaults change after a schedule is created, existing schedules are not affected.

## 2. Chapter-level allocation

User decision: **Allocate across the period in proportion to time.** Divide so the schedule finishes by the end date, and assign more chapters to days with longer study time.

Detailed rules:

- A chapter is a top-level entry of the table of contents. Sections belong to a chapter.
- If the table of contents has no chapters, reject creating a chapter-level schedule.
- The table of contents has no page counts, so treat every chapter as the same size.
- Let `T` be the target time for the whole period and `n` the number of chapters. Chapter `k` ends on the first day when the cumulative time reaches `T × k ÷ n` or more. To avoid fraction errors, compare with `cumulative × n ≥ T × k`.
- The next chapter starts on the day the previous chapter ended if that day's cumulative time is greater than the boundary, and starts on the next item's date if it equals the boundary.
- The boundary of the last chapter is `T`, so it always ends on the last day.
- If there are more chapters than days, assign several chapters to one day, and if there are more days than chapters, assign one chapter across several days.
- Pick the range with a first chapter and a last chapter. If you do not pick, it runs to the start or the end of the book (#36).
- A textbook and chapters linked to a schedule cannot be deleted, just like with study records. If you delete the schedule, they can be deleted again. If the table of contents changes after a schedule is created, the assignment is not recalculated (#36).

Example: with 2, 2, 2, 2, 2, 5, 5 hours (total 20) and 4 chapters, the boundaries are 5, 10, 15, 20. Chapter 1 is on days 1 to 3, chapter 2 on days 3 to 5, chapter 3 on day 6, and chapter 4 on day 7.

## 3. Holiday data

User decision: **Use the Public Data Portal API.**

Detailed rules:

- The source is the holiday information lookup (`getRestDeInfo`) of the Korea Astronomy and Space Science Institute special day information API on the Public Data Portal. A day with `isHoliday` of `Y` is treated as a holiday.
- Read the API key only from the server environment variable `HOLIDAY_API_KEY`. Do not put it in the repository, in logs, or in responses sent to the browser.
- The documentation makes the month required, so look up one year in 12 requests. If even one month fails, treat the whole year as failed.
- Read the response strictly. It is a failure if there is no body, if the count differs from the number of items, if `isHoliday` is neither `Y` nor `N`, or if there is a date from another month.
- If there is at least one holiday but a fixed holiday (Jan 1, Mar 1, May 5, Jun 6, Aug 15, Oct 3, Oct 9, Dec 25) is missing, treat the whole year as failed.
- Check the real responses for substitute holidays and temporary holidays after the key is issued (#129). Until then, it was implemented to match the item descriptions in the official documentation and the known response shape of this API.
- Holiday data is used only when a schedule is created. It is not used for viewing or automatic pushing.
- Save the lookup result in the DB per year and reuse it. A year saved more than 7 days ago is looked up again at the next creation.
- Make the external API call outside a DB transaction.
- If the API returns an empty result without an error, treat it as a year that is not published yet and do not save it. Handle it the same as a lookup failure.
- If it cannot look up again, use the saved data.
- If there is no saved data either, reject creating the schedule and show a Korean error. This is so that a schedule that wrongly calculates a holiday as a weekday is never created.
- The dates and amounts of an already created schedule are not recalculated even if the holiday data changes.

## 4. Handling delays

User decision: **Automatically push later schedule items.**

Detailed rules (implemented in #37):

- If there are incomplete items on dates earlier than today, find the number of delay days so that the earliest incomplete item lands on today.
- Push all incomplete items back by the number of delay days. The gaps between items are kept, so the gaps from dates moved by hand do not disappear, and no item is pulled earlier.
- Completed items do not move. A pushed item can land on the same date as a completed item, so there is no unique constraint on the combination of schedule and date.
- The target time of an item and its chapter assignment stay as they are. Even if the day it moves to is a weekday, nothing is recalculated, so the schedule's total target time and the time-proportional allocation are kept.
- There is no separate scheduler; the server applies it in a transaction when it reads the schedule.
- The end date is the later of the originally set end date and the date of the last item. The screen shows the originally set end date together with the number of days it slipped, so you can see that it slipped.
- Pulling items earlier and moving individual items by hand are also in the scope of #37.
- An item can be moved only to today or later. If you move it to a past date, it would be pushed right away when read. The moved item and the items moved with it must be within 730 days of today.
- If you also move later items, that item and the incomplete items on or after its date are moved by the same number of days. The gaps between items are kept.
- A completed item cannot be moved. If you un-complete an item with a past date, only that item moves to today. This is so that un-checking by mistake once does not push the whole schedule back by the number of days since completion in a way that cannot be undone.
- If you complete an item that was moved to today that way again, it goes back to the date and completion date it had before the cancel (user decision, #165). This is so that the lateness mark and the adherence rate are not left changed by a mistake. If you move that item by hand before completing it again, it follows the new date, and the day you complete it again becomes its completion date. If a day passes while it is open, that item becomes the earliest incomplete item and other incomplete items are pushed too; completing it again does not restore those items.

## 5. Progress

Detailed rules (#38):

- Progress is the target time of completed items ÷ the total target time. Schedules and study records are not linked, so the actual study time is not used. Finishing a longer day raises it by more.
- The percentage is rounded down. It is 100% only when everything is done.
- Moving items does not change the progress.

## 6. Creation input and editing

Detailed rules (#34):

- A schedule is given a name. The amount is saved as an integer number of minutes.
- The start date must be today or later. Items on past dates would be moved by the automatic pushing in chapter 4 as soon as they are read.
- The period is at most 366 days. The holiday lookup holds up the schedule creation request, so the years to look up are limited to two.
- The end date is at most the end of next year. Holidays after that are not published yet, so looking them up only uses up the API call limit.
- After creation, you can edit only the name. Changing the period or the amount would require reading the holidays again, but chapter 3 says to use them only at creation, and recalculating would lose the items that were completed or moved (#37). If the period or the amount changes, delete the schedule and create a new one.

## 7. Textbook and schedule statistics

Detailed rules (#51). On 2026-11-03 the user decided to keep these criteria as they are.

- A chapter is complete if there is at least one completed study record in that chapter or in a section under it. As with the other statistics, only records dated before today are counted.
- An item's original date is its date when the schedule was created and does not change. Automatic pushing and manual moves change only the current date.
- The items counted are those whose original date has passed, or whose original date is today and that are already completed. An item for today that is not finished yet is not late.
- The achievement rate is the share of the counted items' target time that was finished.
- The adherence rate is the share of counted items that were finished by their original date.
- Percentages are rounded down. If there are no counted items, no rate is shown.
- If you pick a textbook, only the schedules linked to that textbook are counted. All includes schedules without a textbook.
