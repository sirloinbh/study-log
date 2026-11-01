import { createApp } from './app.js';
import { createPool } from './sql.js';
const port = Number(process.env.PORT ?? 3102);
const pool = createPool(process.env.DATABASE_URL);
const server = createApp(pool).listen(port, '0.0.0.0', () =>
  console.log(`API http://localhost:${port}`),
);
process.on('SIGTERM', () =>
  server.close(() => {
    void pool.end();
  }),
);
