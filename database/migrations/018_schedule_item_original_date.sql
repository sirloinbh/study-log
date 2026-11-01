-- The date a schedule day was first planned for (#51, rule 7장). Moving a day changes item_date, so
-- keeping to the plan can only be counted against this one, which never changes. Days made before
-- this have only the date they are on now.
ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS original_date date;
UPDATE schedule_items SET original_date = item_date WHERE original_date IS NULL;
ALTER TABLE schedule_items ALTER COLUMN original_date SET NOT NULL;
