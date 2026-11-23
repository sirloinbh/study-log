-- Claude's feedback on a solution (#363): a hint, a grade or an explanation, stored per attempt (#356)
-- so the history keeps each one. A photo of the solution is not kept, only that there was one. The
-- rows go with their attempt, and so with its exercise.
CREATE TABLE IF NOT EXISTS exercise_attempt_feedback (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id bigint NOT NULL REFERENCES exercise_attempts (id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('hint', 'grade', 'explanation')),
  solution text NOT NULL DEFAULT '' CHECK (length(solution) <= 20000),
  has_image boolean NOT NULL DEFAULT false,
  feedback text NOT NULL CHECK (feedback ~ '\S' AND length(feedback) <= 20000),
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exercise_attempt_feedback_attempt_idx
  ON exercise_attempt_feedback (attempt_id, id);
