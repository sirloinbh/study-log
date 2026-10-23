-- Korean translations of exercises and their answers (#31), made by Claude. One per exercise; a new
-- translation replaces it. The texts it was made from are kept, so a translation of an exercise or
-- answer edited since shows as out of date. It goes with its exercise when that is deleted.
CREATE TABLE IF NOT EXISTS exercise_translations (
  exercise_id bigint PRIMARY KEY REFERENCES exercises (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (body ~ '\S' AND length(body) <= 40000),
  answer text CHECK (length(answer) <= 40000),
  source_body text NOT NULL,
  source_answer text,
  model text NOT NULL CHECK (length(model) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
