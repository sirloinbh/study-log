-- Coding problem log (#368, epic #355). One row per problem, many attempts per problem (user decision
-- 2026-11-23). A problem is told apart by its site and key: the number on Baekjoon, the title slug
-- on LeetCode, any short text for another site. An attempt with minutes may also have created a study
-- log (study_log_id); deleting that log keeps the attempt.
CREATE TABLE IF NOT EXISTS coding_problems (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site text NOT NULL CHECK (site IN ('baekjoon', 'leetcode', 'other')),
  problem_key text NOT NULL CHECK (length(btrim(problem_key)) BETWEEN 1 AND 100 AND problem_key !~ '[\r\n]'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200 AND title !~ '[\r\n]'),
  -- Shown as a link, so only http and https.
  url text CHECK (url IS NULL OR (length(url) <= 500 AND url ~ '^https?://[^[:space:]]+$')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coding_problems_site_key_key UNIQUE (site, problem_key)
);

CREATE TABLE IF NOT EXISTS coding_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  problem_id bigint NOT NULL REFERENCES coding_problems (id) ON DELETE CASCADE,
  attempt_date date NOT NULL,
  result text NOT NULL CHECK (result IN ('solved', 'partial', 'failed')),
  language text NOT NULL DEFAULT '' CHECK (length(language) <= 30 AND language !~ '[\r\n]'),
  minutes integer CHECK (minutes BETWEEN 1 AND 1439),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 5000),
  study_log_id bigint REFERENCES study_logs (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coding_attempts_problem_idx
  ON coding_attempts (problem_id, attempt_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS coding_attempts_study_log_idx
  ON coding_attempts (study_log_id) WHERE study_log_id IS NOT NULL;
