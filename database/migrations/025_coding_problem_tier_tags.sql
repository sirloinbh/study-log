-- Tier and tags of a coding problem (#369), filled in from solved.ac for Baekjoon. level is the
-- solved.ac level (0 is unrated, 1 is Bronze V, up to Ruby I and Master); tags are solved.ac tag keys.
ALTER TABLE coding_problems ADD COLUMN IF NOT EXISTS level smallint
  CHECK (level IS NULL OR level BETWEEN 0 AND 40);
ALTER TABLE coding_problems ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'
  CHECK (cardinality(tags) <= 30);
