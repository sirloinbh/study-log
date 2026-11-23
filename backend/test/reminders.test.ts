import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import type { ReminderEmail } from '../src/reminder-sender.js';
import { buildReminder, reminderConfig, runReminder, serviceHour } from '../src/reminders.js';

// 08:30 and 07:59 on 2026-11-24 in Asia/Seoul (UTC+9).
const morning = new Date('2026-11-23T23:30:00Z');
const early = new Date('2026-11-23T22:59:00Z');
const config = { to: 'me@example.com', from: 'sender@example.com' };

// A pool that answers the queries the job makes from in-memory state.
function fakePool(options: { reviews?: object[]; exercises?: object[] } = {}) {
  const claimed = new Set<string>();
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      if (sql.includes('INSERT INTO reminder_sends')) {
        const day = String(params[0]);
        if (claimed.has(day)) return { rowCount: 0, rows: [] };
        claimed.add(day);
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('DELETE FROM reminder_sends')) {
        claimed.delete(String(params[0]));
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('FROM exercise_reviews')) return { rows: options.exercises ?? [] };
      return { rows: options.reviews ?? [] };
    },
  } as unknown as Pool;
  return { pool, claimed };
}

const review = {
  round: 2,
  dueDate: '2026-11-24',
  memo: '',
  textbookTitle: 'Algorithms',
  contentTitle: 'Graphs',
};
const late = {
  round: 1,
  dueDate: '2026-11-22',
  memo: 'Read   the notes',
  textbookTitle: null,
  contentTitle: null,
};
const exercise = {
  step: 1,
  dueDate: '2026-11-24',
  number: '3',
  body: 'Prove it',
  textbookTitle: 'Algorithms',
  contentTitle: 'Graphs',
};

test('the reminder lists what is due and marks overdue ones (#365)', async () => {
  const { pool } = fakePool({ reviews: [late, review], exercises: [exercise] });
  const email = await buildReminder(pool, '2026-11-24');
  assert.equal(email?.subject, 'Study log: 3 reviews due today');
  assert.match(email!.text, /- Round 1: Read the notes \(due 2026-11-22\)/);
  assert.match(email!.text, /- Round 2: Algorithms \/ Graphs\n/);
  assert.match(email!.text, /- Algorithms \/ Graphs: 3\. Prove it/);
});

test('a single review uses the singular and nothing due builds no email', async () => {
  const one = await buildReminder(fakePool({ reviews: [review] }).pool, '2026-11-24');
  assert.equal(one?.subject, 'Study log: 1 review due today');
  assert.equal(await buildReminder(fakePool().pool, '2026-11-24'), undefined);
});

test('the job sends once a day at or after 08:00 Asia/Seoul', async () => {
  const { pool } = fakePool({ reviews: [review] });
  const sent: ReminderEmail[] = [];
  const send = async (email: ReminderEmail) => void sent.push(email);
  assert.equal(await runReminder(pool, send, config, early), 'too-early');
  assert.equal(await runReminder(pool, send, config, morning), 'sent');
  assert.equal(await runReminder(pool, send, config, morning), 'already-sent');
  assert.equal(sent.length, 1);
  assert.deepEqual([sent[0].to, sent[0].from], [config.to, config.from]);
});

test('a day with nothing due sends nothing and is not checked again', async () => {
  const { pool, claimed } = fakePool();
  let calls = 0;
  const send = async () => void calls++;
  assert.equal(await runReminder(pool, send, config, morning), 'nothing-due');
  assert.equal(await runReminder(pool, send, config, morning), 'already-sent');
  assert.equal(calls, 0);
  assert.deepEqual([...claimed], ['2026-11-24']);
});

test('a failed send releases the day so the next run retries', async () => {
  const { pool, claimed } = fakePool({ reviews: [review] });
  const failing = async () => {
    throw new Error('SES down');
  };
  await assert.rejects(runReminder(pool, failing, config, morning), /SES down/);
  assert.equal(claimed.size, 0);
  const sent: ReminderEmail[] = [];
  assert.equal(await runReminder(pool, async (e) => void sent.push(e), config, morning), 'sent');
  assert.equal(sent.length, 1);
});

test('the job is configured only when both addresses are set', () => {
  assert.equal(reminderConfig({}), undefined);
  assert.equal(reminderConfig({ REMINDER_EMAIL_TO: 'a@b.c' }), undefined);
  assert.deepEqual(reminderConfig({ REMINDER_EMAIL_TO: ' a@b.c ', REMINDER_EMAIL_FROM: 'x@y.z' }), {
    to: 'a@b.c',
    from: 'x@y.z',
  });
  assert.equal(serviceHour(morning), 8);
  assert.equal(serviceHour(early), 7);
});
