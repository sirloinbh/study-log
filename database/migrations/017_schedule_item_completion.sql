-- Completing a day of a schedule (#37, rule 4장). Completed items stay on their date; the others are
-- moved when they fall behind, so reads look for those by schedule and date.
ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS completed_on date;

CREATE INDEX IF NOT EXISTS schedule_items_open_idx
  ON schedule_items (schedule_id, item_date) WHERE completed_on IS NULL;
