import { createApp } from './app.js';
import { connectPool } from './pool.js';
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
process.on('SIGTERM', () =>
  server.close(() => {
    void pool.end();
  }),
);
