-- Reviews of exercises I got wrong (#358, rules in docs/decisions/review-rules.md chapter 7). One row
-- per exercise while its cycle runs: `step` 1 to 4 is the interval (1, 3, 7, 14 days after the
-- attempt), due_date is when it is due. Finishing step 4 deletes the row; a wrong or hinted attempt
-- restarts it at step 1. The row goes with its exercise.
CREATE TABLE IF NOT EXISTS exercise_reviews (
  exercise_id bigint PRIMARY KEY REFERENCES exercises (id) ON DELETE CASCADE,
  step integer NOT NULL CHECK (step BETWEEN 1 AND 4),
  due_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exercise_reviews_due_idx ON exercise_reviews (due_date);
