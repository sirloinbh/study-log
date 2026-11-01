-- Study schedules (#34, rules in docs/decisions/schedule-rules.md). The daily amounts are kept per
-- schedule. end_date is the end first chosen; items may later move past it (#37). Holidays are read
-- only when creating, so items hold their target rather than the kind of day.
CREATE TABLE IF NOT EXISTS schedules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  start_date date NOT NULL,
  end_date date NOT NULL,
  weekday_minutes integer NOT NULL CHECK (weekday_minutes BETWEEN 0 AND 1440),
  rest_day_minutes integer NOT NULL CHECK (rest_day_minutes BETWEEN 0 AND 1440),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (weekday_minutes + rest_day_minutes > 0)
);

-- A day of a schedule. Not unique per date: a delayed item can land on the date of a completed one
-- (rule 4장). A day with no study time has no item, so the target is never 0.
CREATE TABLE IF NOT EXISTS schedule_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  schedule_id bigint NOT NULL REFERENCES schedules (id) ON DELETE CASCADE,
  item_date date NOT NULL,
  target_minutes integer NOT NULL CHECK (target_minutes BETWEEN 1 AND 1440),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedule_items_schedule_date_idx
  ON schedule_items (schedule_id, item_date);
