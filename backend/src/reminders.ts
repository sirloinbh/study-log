import type { Pool } from 'pg';

import { listExerciseReviews } from './exercise-reviews.js';
import type { ReminderEmail, ReminderSender } from './reminder-sender.js';
import { serviceDate } from './standard/http.js';

// The daily review reminder (#365): one email at 08:00 Asia/Seoul on a day with reviews due, none on a
// day without. "Due" is what the Today page lists: study log rounds and exercise reviews due today or
// overdue. The job lives in the API process and checks once a minute; `reminder_sends` makes a day
// send once even across restarts.
export const reminderHour = 8;

export type ReminderConfig = { to: string; from: string };

// Both addresses are needed; without them the job stays off.
export function reminderConfig(env: NodeJS.ProcessEnv = process.env): ReminderConfig | undefined {
  const to = env.REMINDER_EMAIL_TO?.trim();
  const from = env.REMINDER_EMAIL_FROM?.trim();
  return to && from ? { to, from } : undefined;
}

// Hour of the day (0-23) in the service time zone.
export function serviceHour(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
}

type DueReview = {
  round: number;
  dueDate: string;
  memo: string;
  textbookTitle: string | null;
  contentTitle: string | null;
};

async function dueReviews(pool: Pick<Pool, 'query'>, today: string): Promise<DueReview[]> {
  const { rows } = await pool.query<DueReview>(
    `SELECT r.round, to_char(r.due_date, 'YYYY-MM-DD') AS "dueDate", l.memo,
       t.title AS "textbookTitle", c.title AS "contentTitle"
     FROM reviews r
     JOIN study_logs l ON l.id = r.study_log_id
     LEFT JOIN textbooks t ON t.id = l.textbook_id
     LEFT JOIN textbook_contents c ON c.id = l.content_id
     WHERE r.completed_on IS NULL AND r.due_date <= $1::date
     ORDER BY r.due_date, r.id`,
    [today],
  );
  return rows;
}

const clip = (text: string, max = 60) => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

// The email for `today`, or undefined when nothing is due.
export async function buildReminder(
  pool: Pick<Pool, 'query'>,
  today: string,
): Promise<{ subject: string; text: string } | undefined> {
  const [reviews, exercises] = await Promise.all([
    dueReviews(pool, today),
    listExerciseReviews(pool, today) as Promise<
      {
        step: number;
        dueDate: string;
        number: string;
        body: string;
        textbookTitle: string;
        contentTitle: string;
      }[]
    >,
  ]);
  const total = reviews.length + exercises.length;
  if (total === 0) return undefined;
  const overdue = (dueDate: string) => (dueDate < today ? ` (due ${dueDate})` : '');
  const lines = [
    `You have ${total} ${total === 1 ? 'review' : 'reviews'} due today (${today}).`,
    '',
  ];
  if (reviews.length > 0) {
    lines.push('Study log reviews:');
    for (const r of reviews) {
      const where =
        [r.textbookTitle, r.contentTitle].filter(Boolean).join(' / ') ||
        clip(r.memo) ||
        'Study log';
      lines.push(`- Round ${r.round}: ${where}${overdue(r.dueDate)}`);
    }
    lines.push('');
  }
  if (exercises.length > 0) {
    lines.push('Exercise reviews:');
    for (const e of exercises) {
      const name = e.number ? `${e.number}. ${clip(e.body, 40)}` : clip(e.body, 40);
      lines.push(`- ${e.textbookTitle} / ${e.contentTitle}: ${name}${overdue(e.dueDate)}`);
    }
    lines.push('');
  }
  return {
    subject: `Study log: ${total} ${total === 1 ? 'review' : 'reviews'} due today`,
    text: lines.join('\n').trimEnd() + '\n',
  };
}

export type ReminderResult = 'sent' | 'nothing-due' | 'already-sent' | 'too-early';

// One run of the job at `now`. Claims the day first, so a second run does nothing; a failed send
// releases the claim and rethrows, so the next tick retries.
export async function runReminder(
  pool: Pick<Pool, 'query'>,
  send: ReminderSender,
  config: ReminderConfig,
  now = new Date(),
): Promise<ReminderResult> {
  if (serviceHour(now) < reminderHour) return 'too-early';
  const today = serviceDate(now);
  const claim = await pool.query(
    'INSERT INTO reminder_sends (send_date) VALUES ($1) ON CONFLICT DO NOTHING',
    [today],
  );
  if (claim.rowCount === 0) return 'already-sent';
  try {
    const email = await buildReminder(pool, today);
    if (!email) return 'nothing-due'; // the claim stays: a day with nothing due is not re-checked
    await send({ ...config, ...email } satisfies ReminderEmail);
    return 'sent';
  } catch (error) {
    await pool.query('DELETE FROM reminder_sends WHERE send_date = $1', [today]);
    throw error;
  }
}

// Starts the once-a-minute check; returns the stop function. Errors are logged as one line without
// the email addresses or the message.
export function startReminderJob(
  pool: Pool,
  send: ReminderSender,
  config: ReminderConfig,
  intervalMs = 60_000,
) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runReminder(pool, send, config);
      if (result === 'sent') console.log(JSON.stringify({ event: 'reminder_sent' }));
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'reminder_failed',
          error: error instanceof Error ? error.name : 'unknown',
        }),
      );
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
