-- Weekly and monthly retrospectives (#19). One per period (the user's decision): writing the
-- same week or month again edits it. A week runs Sunday to Saturday (#96), a month from its 1st
-- to its last day; the database checks the period itself, not only the API.
CREATE TABLE IF NOT EXISTS retrospectives (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('weekly', 'monthly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  -- At least one non-whitespace character, as the other long texts.
  body text NOT NULL CHECK (body ~ '\S' AND length(body) <= 20000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retrospectives_period_check CHECK (
    (kind = 'weekly' AND extract(dow FROM period_start) = 0 AND period_end = period_start + 6)
    OR (
      kind = 'monthly'
      AND extract(day FROM period_start) = 1
      AND period_end = (period_start + interval '1 month' - interval '1 day')::date
    )
  ),
  CONSTRAINT retrospectives_period_key UNIQUE (kind, period_start)
);
