-- The chapters and sections a study log finished (#480). A log may finish several entries of its
-- textbook. The composite foreign key keeps each entry inside the textbook the row names, and the
-- API writes the log's own textbook there. An entry that a log finished cannot be deleted
-- (RESTRICT), like the single content_id of the log. Deleting the log removes its rows.
CREATE TABLE IF NOT EXISTS study_log_contents (
  study_log_id bigint NOT NULL REFERENCES study_logs (id) ON DELETE CASCADE,
  textbook_id bigint NOT NULL,
  content_id bigint NOT NULL,
  PRIMARY KEY (study_log_id, content_id),
  CONSTRAINT study_log_contents_content_fkey FOREIGN KEY (textbook_id, content_id)
    REFERENCES textbook_contents (textbook_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS study_log_contents_content_idx ON study_log_contents (content_id);

-- A log made before this table counts its one linked entry as finished.
INSERT INTO study_log_contents (study_log_id, textbook_id, content_id)
SELECT id, textbook_id, content_id FROM study_logs WHERE content_id IS NOT NULL
ON CONFLICT DO NOTHING;
