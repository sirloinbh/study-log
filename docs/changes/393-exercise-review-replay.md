# #393 Keep an exercise's wrong-answer review in step with its attempts

- `syncExerciseReview` now rebuilds the review by replaying the exercise's attempts oldest first (`replayExerciseReview`), after an attempt is added and after one is deleted, in the same transaction. The exercise row is locked so two attempts rebuild one after the other.
- Before: deleting an attempt left the review due, and an attempt with an earlier date than the latest was applied as the newest.
- Rule text updated in `docs/decisions/review-rules.md` chapter 7 (it said deleting an attempt does not recalculate). The user chose this on the issue.
- Tests: unit test for the replay; integration test for delete and back-dated add (CI only without `TEST_DATABASE_URL`).
