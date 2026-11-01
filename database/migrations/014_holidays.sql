-- Public holidays read from the data portal (#33, docs/decisions/schedule-rules.md 3장), kept per
-- year so creating a schedule does not call the API each time. Two holidays can share a date.
CREATE TABLE IF NOT EXISTS holiday_years (
  year integer PRIMARY KEY,
  fetched_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS holidays (
  holiday_date date NOT NULL,
  name text NOT NULL,
  PRIMARY KEY (holiday_date, name)
);
