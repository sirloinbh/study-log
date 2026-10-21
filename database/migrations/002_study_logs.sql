-- Study log entries (#10). A session that passes midnight belongs to its start date,
-- so end_time may be earlier than start_time; duration_minutes is computed by the API.
CREATE TABLE IF NOT EXISTS study_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  study_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1439),
  memo text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'done', 'stopped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_logs_date_idx ON study_logs (study_date DESC, start_time DESC);
