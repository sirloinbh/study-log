import { Pool } from 'pg';

import { createPool } from './standard/db.js';

const logError = (event: string) => (error: Error) =>
  console.error(JSON.stringify({ event, message: error.message }));

// The managed createPool listens for idle clients. pg stops listening on a client while it is checked out (in a
// transaction, between its queries), and an unheard `error` event would end the process, so each connection also
// gets its own listener here. Queries on a lost connection still reject and answer 500; the pool replaces it.
export function connectPool(connectionString: string | undefined) {
  const pool = createPool(new Pool({ connectionString }), (_message, error) =>
    logError('db_pool_error')(error),
  );
  pool.on('connect', (client) => client.on('error', logError('db_connection_error')));
  return pool;
}
