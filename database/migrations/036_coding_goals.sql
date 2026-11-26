-- Algorithm goal lists (#425, epic #423). A list is imported from an Excel sheet and holds the
-- problems the user plans to solve, in order. An item names its problem by site and key, the same
-- pair that tells coding_problems apart, but is not a foreign key: a goal can list a problem that
-- has no attempt yet, and deleting a problem must not remove it from the list. A list is told
-- apart by its name, so importing the same file again updates the list instead of adding one.
CREATE TABLE IF NOT EXISTS coding_goal_lists (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100 AND name !~ '[\r\n]'),
  -- Optional: the day the whole list should be done.
  target_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coding_goal_lists_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS coding_goal_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  list_id bigint NOT NULL REFERENCES coding_goal_lists (id) ON DELETE CASCADE,
  site text NOT NULL CHECK (site IN ('baekjoon', 'leetcode', 'other')),
  problem_key text NOT NULL CHECK (length(btrim(problem_key)) BETWEEN 1 AND 100 AND problem_key !~ '[\r\n]'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200 AND title !~ '[\r\n]'),
  -- The stage and the topic as the file names them.
  group_name text NOT NULL DEFAULT '' CHECK (length(group_name) <= 100 AND group_name !~ '[\r\n]'),
  topic text NOT NULL DEFAULT '' CHECK (length(topic) <= 100 AND topic !~ '[\r\n]'),
  -- The solved.ac level (1 Bronze V ... 30 Ruby I, 0 unrated), when the file names a tier.
  level smallint CHECK (level BETWEEN 0 AND 30),
  target_date date,
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coding_goal_items_list_problem_key UNIQUE (list_id, site, problem_key)
);

CREATE INDEX IF NOT EXISTS coding_goal_items_order_idx
  ON coding_goal_items (list_id, position, id);
CREATE INDEX IF NOT EXISTS coding_goal_items_problem_idx
  ON coding_goal_items (site, problem_key);
