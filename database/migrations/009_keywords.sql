-- Keywords of the day (#39): important words noted while studying, kept per date. The same
-- keyword appears once per date, ignoring case; the memo is optional.
CREATE TABLE IF NOT EXISTS keywords (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keyword_date date NOT NULL,
  keyword text NOT NULL CHECK (keyword = btrim(keyword) AND keyword <> '' AND length(keyword) <= 50),
  memo text NOT NULL DEFAULT '' CHECK (length(memo) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One keyword per date regardless of case; also serves listing a date's keywords.
CREATE UNIQUE INDEX IF NOT EXISTS keywords_date_keyword_key ON keywords (keyword_date, lower(keyword));
