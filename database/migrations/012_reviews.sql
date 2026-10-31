-- Review rounds of a study log (#42, rules in docs/decisions/review-rules.md). One row per round; a
-- round is created when the one before it is completed, so completed_on is the completion record.
-- original_due_date keeps the date a snooze or manual change replaces, for counting delays (#46).
-- Rounds go with their study log when it is deleted.
CREATE TABLE IF NOT EXISTS reviews (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  study_log_id bigint NOT NULL REFERENCES study_logs (id) ON DELETE CASCADE,
  round integer NOT NULL CHECK (round BETWEEN 1 AND 5),
  due_date date NOT NULL,
  original_due_date date NOT NULL,
  completed_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_log_id, round)
);

CREATE INDEX IF NOT EXISTS reviews_open_due_idx ON reviews (due_date) WHERE completed_on IS NULL;
