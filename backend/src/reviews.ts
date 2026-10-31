import type { PoolClient } from 'pg';

// Days from the previous round's completion (the study date for round 1) to the next round. Done
// on time, the rounds land 1, 3, 7, 14 and 30 days after studying (docs/decisions/review-rules.md).
export const reviewGaps = [1, 2, 4, 7, 16] as const;

// The API accepts study dates up to here, and a later date would not fit YYYY-MM-DD.
const lastDate = '9999-12-31';

// Not stats.addDays: stats imports study-logs, which imports this file.
export function reviewDueDate(baseDate: string, round: 1 | 2 | 3 | 4 | 5) {
  const date = new Date(`${baseDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + reviewGaps[round - 1]);
  return date.getUTCFullYear() > 9999 ? lastDate : date.toISOString().slice(0, 10);
}

type LogState = { status: string; studyDate: string };

// Keeps round 1 in step with a study log saved in the same transaction. `previous` is the log
// before the save, undefined when it is new. Only a change of status or date acts, so logs that
// were already done before this feature, or a memo edit, create nothing.
export async function syncFirstReview(
  client: PoolClient,
  id: number,
  previous: LogState | undefined,
  log: LogState,
) {
  const wasDone = previous?.status === 'done';
  if (log.status === 'done' && !wasDone) {
    const due = reviewDueDate(log.studyDate, 1);
    // A log whose round 1 was already completed keeps its reviews when it is done again.
    await client.query(
      `INSERT INTO reviews (study_log_id, round, due_date, original_due_date)
       VALUES ($1, 1, $2, $2) ON CONFLICT (study_log_id, round) DO NOTHING`,
      [id, due],
    );
  } else if (log.status !== 'done' && wasDone) {
    await client.query(
      'DELETE FROM reviews WHERE study_log_id = $1 AND round = 1 AND completed_on IS NULL',
      [id],
    );
  } else if (log.status === 'done' && previous?.studyDate !== log.studyDate) {
    // Replaces a snoozed date as well: the old dates belonged to a study date that was wrong.
    const due = reviewDueDate(log.studyDate, 1);
    await client.query(
      `UPDATE reviews SET due_date = $2, original_due_date = $2, updated_at = now()
       WHERE study_log_id = $1 AND round = 1 AND completed_on IS NULL`,
      [id, due],
    );
  }
}
