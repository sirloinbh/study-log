import { Pool } from 'pg';

import { createPool } from './standard/db.js';

// The managed createPool listens on every connection (idle or checked out). Its log line is replaced by one
// structured line that carries only the event and the message, so nothing about the connection reaches the log.
export function connectPool(connectionString: string | undefined) {
  return createPool(new Pool({ connectionString }), (_message, error) =>
    console.error(JSON.stringify({ event: 'db_connection_error', message: error.message })),
  );
}
