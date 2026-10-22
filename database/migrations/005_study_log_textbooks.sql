-- Study logs may name the textbook and the chapter or section studied (#14). Both are optional;
-- a chapter needs its textbook and must belong to it (composite foreign key). A textbook or
-- chapter that study logs point to cannot be deleted (RESTRICT), so past logs never lose them.
ALTER TABLE study_logs ADD COLUMN IF NOT EXISTS textbook_id bigint;
ALTER TABLE study_logs ADD COLUMN IF NOT EXISTS content_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_logs_textbook_fkey') THEN
    ALTER TABLE study_logs ADD CONSTRAINT study_logs_textbook_fkey
      FOREIGN KEY (textbook_id) REFERENCES textbooks (id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_logs_content_fkey') THEN
    ALTER TABLE study_logs ADD CONSTRAINT study_logs_content_fkey
      FOREIGN KEY (textbook_id, content_id) REFERENCES textbook_contents (textbook_id, id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_logs_content_needs_textbook') THEN
    ALTER TABLE study_logs ADD CONSTRAINT study_logs_content_needs_textbook
      CHECK (content_id IS NULL OR textbook_id IS NOT NULL);
  END IF;
END $$;

-- The textbook filter and the RESTRICT checks look study logs up by these columns.
CREATE INDEX IF NOT EXISTS study_logs_textbook_idx
  ON study_logs (textbook_id, study_date DESC, start_time DESC) WHERE textbook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS study_logs_content_idx
  ON study_logs (textbook_id, content_id) WHERE content_id IS NOT NULL;
