import type { Pool, PoolClient } from 'pg';

import { addDays, weekStart } from './stats.js';

type Db = Pick<Pool | PoolClient, 'query'>;

export type CodingPeriod = { attempts: number; solved: number; minutes: number };
export type CodingSummary = {
  today: CodingPeriod;
  week: CodingPeriod;
  // Days in a row, ending today (or yesterday while today has no attempt yet), with an attempt.
  streak: number;
  // The language of the latest attempt that named one, so the quick log can preselect it.
  lastLanguage: string;
};

// How far back the streak is counted; a longer run shows as this many days.
const streakWindow = 366;

// The number of consecutive days ending at `today`, or at yesterday when today is still empty.
export function streakOf(days: readonly string[], today: string) {
  const set = new Set(days);
  let day = set.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(day) && streak < streakWindow) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

// The practice at a glance for the Coding screen (#427): today, this week (Sunday to Saturday, like
// the other weekly figures), the streak and the language last used.
export async function codingSummary(db: Db, today: string): Promise<CodingSummary> {
  const from = weekStart(today);
  const period = async (start: string): Promise<CodingPeriod> => {
    const { rows } = await db.query<CodingPeriod>(
      `SELECT count(*)::int AS attempts,
              count(*) FILTER (WHERE result = 'solved')::int AS solved,
              COALESCE(sum(minutes), 0)::int AS minutes
       FROM coding_attempts WHERE attempt_date >= $1 AND attempt_date <= $2`,
      [start, today],
    );
    return rows[0];
  };
  const [todayPeriod, weekPeriod, dayRows, languageRows] = await Promise.all([
    period(today),
    period(from),
    db.query<{ day: string }>(
      `SELECT DISTINCT to_char(attempt_date, 'YYYY-MM-DD') AS day FROM coding_attempts
       WHERE attempt_date <= $1 AND attempt_date > $2`,
      [today, addDays(today, -streakWindow)],
    ),
    db.query<{ language: string }>(
      `SELECT language FROM coding_attempts WHERE language <> ''
       ORDER BY attempt_date DESC, id DESC LIMIT 1`,
    ),
  ]);
  return {
    today: todayPeriod,
    week: weekPeriod,
    streak: streakOf(
      dayRows.rows.map((row) => row.day),
      today,
    ),
    lastLanguage: languageRows.rows[0]?.language ?? '',
  };
}
