import { Pool } from 'pg';

import { createApp } from './app.js';
import { sharedAuth } from './standard/auth.js';
import { createPool } from './standard/db.js';

const pool = createPool(new Pool({ connectionString: process.env.DATABASE_URL }));
const port = Number(process.env.PORT ?? 3102);
const server = createApp(pool, { auth: sharedAuth() }).listen(port, '0.0.0.0', () =>
  console.log(`API http://localhost:${port}`),
);
process.on('SIGTERM', () =>
  server.close(() => {
    void pool.end();
  }),
);
