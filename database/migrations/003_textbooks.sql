-- Textbooks (#12). Tables that belong to a textbook (contents, exercises) cascade with it;
-- study logs that reference a textbook will block its deletion (#14).
CREATE TABLE IF NOT EXISTS textbooks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  author text NOT NULL DEFAULT '',
  edition text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
