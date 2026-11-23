-- One-way sync to a "Study log" Google calendar (#366). The connection is one row (id 1). The refresh
-- token is kept encrypted (AES-256-GCM, key from CALENDAR_TOKEN_KEY), never as plain text.
CREATE TABLE IF NOT EXISTS calendar_connection (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refresh_token_enc text NOT NULL,
  calendar_id text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  last_error text
);

-- The Google event that stands for one schedule item or one review round. The sync compares this
-- with what the app holds now and creates, moves or deletes events to match. No foreign keys: a
-- deleted item or review has to leave its row here until the event is deleted in Google.
CREATE TABLE IF NOT EXISTS calendar_events (
  source text NOT NULL CHECK (source IN ('schedule_item', 'review')),
  source_id bigint NOT NULL,
  event_id text NOT NULL,
  event_date date NOT NULL,
  summary text NOT NULL,
  PRIMARY KEY (source, source_id)
);
