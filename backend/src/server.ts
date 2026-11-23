import { createApp } from './app.js';
import { connectPool } from './pool.js';
import { sesSender } from './reminder-sender.js';
import { reminderConfig, startReminderJob } from './reminders.js';
import { listenHost, sharedAuth } from './standard/auth.js';

const pool = connectPool(process.env.DATABASE_URL);
const port = Number(process.env.PORT ?? 3102);
// 127.0.0.1 when the sign-in is off (local run), so the open API is not reachable from the network (#898).
const auth = sharedAuth();
const host = listenHost(auth !== undefined);
const server = createApp(pool, { auth, toolsPublicKey: process.env.AI_TOOLS_PUBLIC_KEY }).listen(
  port,
  host,
  () => console.log(`API http://${host}:${port}`),
);
// The daily review reminder email (#365); off unless both addresses are set.
const reminder = reminderConfig();
const stopReminder = reminder ? startReminderJob(pool, sesSender(), reminder) : undefined;
process.on('SIGTERM', () => {
  stopReminder?.();
  server.close(() => {
    void pool.end();
  });
});
