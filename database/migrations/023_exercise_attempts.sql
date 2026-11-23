-- Attempts at an exercise (#356): each time the exercise is solved, whether it was right or wrong and
-- whether a hint was needed. Attempts go with their exercise when it is deleted. The latest attempt
-- (highest attempt_date, then id) decides whether the exercise counts as wrong (#357).
CREATE TABLE IF NOT EXISTS exercise_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exercise_id bigint NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
  attempt_date date NOT NULL,
  result text NOT NULL CHECK (result IN ('correct', 'wrong')),
  hint_used boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exercise_attempts_exercise_idx
  ON exercise_attempts (exercise_id, attempt_date DESC, id DESC);
