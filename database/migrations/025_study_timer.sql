-- Study timer (#360). At most one timer runs at a time (the one row has id 1), kept on the server so
-- a reload or another tab shows the same time. Paused time is added up in paused_seconds; while the
-- timer is paused, paused_at is when the pause began. Stopping turns the timer into a study log and
-- deletes the row. A session that passes midnight belongs to its start date (study_logs rule).
CREATE TABLE IF NOT EXISTS study_timer (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  started_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  paused_seconds integer NOT NULL DEFAULT 0 CHECK (paused_seconds >= 0)
);
