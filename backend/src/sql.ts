import { Pool, type PoolClient } from 'pg';

// pg reports a lost connection as an `error` event, and an event nobody listens to ends the process
// (#133). Queries on that connection still reject and answer 500, and the pool replaces it, so here
// it is only logged, with the message alone: a connection error must not bring the API down.
export function createPool(connectionString: string | undefined) {
  const pool = new Pool({ connectionString });
  // A checked-out client (in a transaction, between its queries) reports on the client itself.
  pool.on('connect', (client) =>
    client.on('error', (error) =>
      console.error(JSON.stringify({ event: 'db_connection_error', message: error.message })),
    ),
  );
  // An idle client reports on the pool as well; the listener above has already logged it.
  pool.on('error', () => undefined);
  return pool;
}

// A LIKE pattern matching `text` anywhere. LIKE treats % and _ as wildcards (and \ as the
// escape), so a search for "50%" must mean the characters themselves.
export const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Runs `run` in one transaction. It commits unless `commit` says otherwise or `run` throws.
export async function inTransaction<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
  commit: (result: T) => boolean = () => true,
): Promise<T> {
  const client = await pool.connect();
  // Set when even ROLLBACK fails (a dropped connection): the client is then destroyed instead of
  // going back to the pool, where the next request would get the broken connection (#68).
  let broken: Error | undefined;
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query(commit(result) ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      broken = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
    }
    throw error;
  } finally {
    client.release(broken);
  }
}
