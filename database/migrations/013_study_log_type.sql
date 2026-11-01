-- What kind of study a log is (#52): new material or review. Chosen when writing the log; every
-- existing log starts as new.
ALTER TABLE study_logs ADD COLUMN IF NOT EXISTS study_type text NOT NULL DEFAULT 'new';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_logs_study_type_check' AND conrelid = 'study_logs'::regclass) THEN
    ALTER TABLE study_logs ADD CONSTRAINT study_logs_study_type_check
      CHECK (study_type IN ('new', 'review'));
  END IF;
END $$;
