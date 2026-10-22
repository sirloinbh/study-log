-- Self-assessment right after studying (#15): understanding on a 1-5 scale, what was hard, and
-- whether the session's goal was reached. All optional; NULL means not answered.
ALTER TABLE study_logs ADD COLUMN IF NOT EXISTS understanding smallint;
ALTER TABLE study_logs ADD COLUMN IF NOT EXISTS difficulties text NOT NULL DEFAULT '';
ALTER TABLE study_logs ADD COLUMN IF NOT EXISTS goal_achieved boolean;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_logs_understanding_range') THEN
    ALTER TABLE study_logs ADD CONSTRAINT study_logs_understanding_range
      CHECK (understanding BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_logs_difficulties_length') THEN
    ALTER TABLE study_logs ADD CONSTRAINT study_logs_difficulties_length
      CHECK (length(difficulties) <= 2000);
  END IF;
END $$;
