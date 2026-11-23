-- Flashcard answers for keywords (#359): whether a keyword was known on a review day. One row per
-- keyword per day; answering again the same day replaces it. The latest answer before a day decides
-- the order next time (not known first). Answers go with their keyword when it is deleted.
CREATE TABLE IF NOT EXISTS keyword_cards (
  keyword_id bigint NOT NULL REFERENCES keywords (id) ON DELETE CASCADE,
  card_date date NOT NULL,
  known boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (keyword_id, card_date)
);
