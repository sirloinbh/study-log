-- Chapters of a textbook laid out over a schedule (#36, rule 2장). A day can hold several chapters
-- and a chapter several days. A textbook or chapter a schedule points to cannot be deleted (RESTRICT),
-- as with study logs; the chapter's composite key keeps it inside the textbook.
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS textbook_id bigint REFERENCES textbooks (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS schedules_textbook_idx ON schedules (textbook_id) WHERE textbook_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS schedule_item_contents (
  schedule_item_id bigint NOT NULL REFERENCES schedule_items (id) ON DELETE CASCADE,
  textbook_id bigint NOT NULL,
  content_id bigint NOT NULL,
  PRIMARY KEY (schedule_item_id, content_id),
  CONSTRAINT schedule_item_contents_content_fkey FOREIGN KEY (textbook_id, content_id)
    REFERENCES textbook_contents (textbook_id, id) ON DELETE RESTRICT
);

-- The RESTRICT check looks items up by chapter.
CREATE INDEX IF NOT EXISTS schedule_item_contents_content_idx
  ON schedule_item_contents (textbook_id, content_id);
