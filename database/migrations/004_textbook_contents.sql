-- Textbook table of contents (#13): chapters and sections as a tree. A parent must belong to the
-- same textbook, enforced by the composite foreign key. Siblings are ordered by position
-- (0, 1, 2, ...); the unique constraint is checked at the end of each statement so one UPDATE can
-- shift or reorder siblings. Deleting a textbook or a parent removes everything below it.
CREATE TABLE IF NOT EXISTS textbook_contents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  textbook_id bigint NOT NULL REFERENCES textbooks (id) ON DELETE CASCADE,
  parent_id bigint,
  position integer NOT NULL CHECK (position >= 0),
  number text NOT NULL DEFAULT '' CHECK (length(number) <= 20),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT textbook_contents_textbook_id_id_key UNIQUE (textbook_id, id),
  CONSTRAINT textbook_contents_parent_fkey FOREIGN KEY (textbook_id, parent_id)
    REFERENCES textbook_contents (textbook_id, id) ON DELETE CASCADE,
  CONSTRAINT textbook_contents_sibling_position_key
    UNIQUE NULLS NOT DISTINCT (textbook_id, parent_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX IF NOT EXISTS textbook_contents_parent_idx ON textbook_contents (parent_id);
