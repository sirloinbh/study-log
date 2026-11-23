-- Weekly study goals (#361). One goal in minutes per week, keyed by the week's Sunday (weeks run
-- Sunday to Saturday, Asia/Seoul). A week with no row uses the latest earlier goal, so a goal stays
-- until it is changed. At most 7 days of minutes.
CREATE TABLE IF NOT EXISTS weekly_goals (
  week_start date PRIMARY KEY,
  goal_minutes integer NOT NULL CHECK (goal_minutes BETWEEN 1 AND 10080),
  updated_at timestamptz NOT NULL DEFAULT now()
);
