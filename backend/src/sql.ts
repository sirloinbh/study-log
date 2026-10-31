import type { Pool, PoolClient } from 'pg';

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
