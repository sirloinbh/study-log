-- Exercises (#24): problems typed in from a textbook, each under one chapter or section. The
-- composite foreign key keeps the chapter in the same textbook; exercises go with their chapter
-- (and so with their textbook) when it is deleted. The body keeps its line breaks as typed.
CREATE TABLE IF NOT EXISTS exercises (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  textbook_id bigint NOT NULL,
  content_id bigint NOT NULL,
  number text NOT NULL DEFAULT '' CHECK (length(number) <= 20),
  -- At least one non-whitespace character (tabs and line breaks count as whitespace, as in the API).
  body text NOT NULL CHECK (body ~ '\S' AND length(body) <= 20000),
  important boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercises_content_fkey FOREIGN KEY (textbook_id, content_id)
    REFERENCES textbook_contents (textbook_id, id) ON DELETE CASCADE
);

-- Listing a chapter's exercises in the order they were added.
CREATE INDEX IF NOT EXISTS exercises_content_idx ON exercises (textbook_id, content_id, id);
