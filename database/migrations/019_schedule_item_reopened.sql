-- Undoing a mistaken reopen (#165, rule 4장). Reopening a day already past brings it to today; these
-- keep the date it was on and the day it was done, so completing it again puts both back. Both are
-- set or neither. Moving the day by hand forgets them.
ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS reopened_from date;
ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS reopened_completed_on date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_items_reopened_pair' AND conrelid = 'schedule_items'::regclass) THEN
    ALTER TABLE schedule_items ADD CONSTRAINT schedule_items_reopened_pair
      CHECK ((reopened_from IS NULL) = (reopened_completed_on IS NULL));
  END IF;
END $$;
