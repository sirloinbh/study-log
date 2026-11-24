-- The calendar sync (#366) also keeps events for the review dates of exercises I got wrong (#403);
-- source_id is then the exercise id.
ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_source_check;
ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_source_check
  CHECK (source IN ('schedule_item', 'review', 'exercise_review'));
