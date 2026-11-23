-- LeetCode difficulty of a coding problem (#370), filled in by the LeetCode import.
ALTER TABLE coding_problems ADD COLUMN IF NOT EXISTS difficulty text
  CHECK (difficulty IS NULL OR difficulty IN ('Easy', 'Medium', 'Hard'));
