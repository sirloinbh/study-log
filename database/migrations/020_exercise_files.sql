-- Original files of exercises and answers (#28): PDFs and photos kept in S3. A row records one
-- uploaded file and where it is stored; the bytes are only in S3 under `storage_key`. `role` says
-- whether the file shows the problem or its answer. Rows go with their exercise (and so with its
-- chapter and textbook) when that is deleted.
CREATE TABLE IF NOT EXISTS exercise_files (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exercise_id bigint NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('problem', 'answer')),
  storage_key text NOT NULL UNIQUE CHECK (length(storage_key) <= 200),
  original_name text NOT NULL CHECK (original_name ~ '\S' AND length(original_name) <= 255),
  content_type text NOT NULL
    CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  -- Same bound as the upload API (20 MiB).
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Listing an exercise's files in the order they were added.
CREATE INDEX IF NOT EXISTS exercise_files_exercise_idx ON exercise_files (exercise_id, id);
