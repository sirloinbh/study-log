-- Exercise answers (#26): at most one answer per exercise, typed in by hand. The answer goes with
-- its exercise (and so with its chapter and textbook) when that is deleted. The body keeps its
-- line breaks as typed, like the exercise body.
CREATE TABLE IF NOT EXISTS exercise_answers (
  exercise_id bigint PRIMARY KEY REFERENCES exercises (id) ON DELETE CASCADE,
  -- At least one non-whitespace character (tabs and line breaks count as whitespace, as in the API).
  body text NOT NULL CHECK (body ~ '\S' AND length(body) <= 20000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
