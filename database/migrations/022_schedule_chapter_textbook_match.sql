-- A chapter laid out on a schedule day must belong to the schedule's own textbook (#270). The composite key
-- of 016 only ties the chapter to the textbook_id stored in the same row; nothing tied that column to
-- schedules.textbook_id. A trigger can, because schedule_items does not carry the textbook.
-- Rows already stored are not rechecked: the app only ever wrote matching ones.
CREATE OR REPLACE FUNCTION schedule_item_contents_textbook_match() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schedule_items i JOIN schedules s ON s.id = i.schedule_id
    WHERE i.id = NEW.schedule_item_id AND s.textbook_id IS NOT DISTINCT FROM NEW.textbook_id
      AND s.textbook_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A schedule chapter must belong to the textbook of its schedule'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS schedule_item_contents_textbook_match ON schedule_item_contents;
CREATE TRIGGER schedule_item_contents_textbook_match
  BEFORE INSERT OR UPDATE OF schedule_item_id, textbook_id ON schedule_item_contents
  FOR EACH ROW EXECUTE FUNCTION schedule_item_contents_textbook_match();
