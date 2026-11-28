-- Study logs no longer have Difficult parts (#475). The user decided to drop the old text (D1).
-- The length check study_logs_difficulties_length goes with the column.
ALTER TABLE study_logs DROP COLUMN IF EXISTS difficulties;
