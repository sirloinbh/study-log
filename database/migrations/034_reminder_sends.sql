-- One row per day a review reminder email was claimed (#365). The daily job inserts the day before it
-- sends, so two runs (a restart at 08:00, a second container) cannot send twice; a failed send deletes
-- its row so the next tick retries. send_date is the Asia/Seoul calendar day.
CREATE TABLE IF NOT EXISTS reminder_sends (
  send_date date PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
