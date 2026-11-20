import type { Pool, PoolClient } from 'pg';

import { withTransaction } from './standard/db.js';

// A LIKE pattern matching `text` anywhere. LIKE treats % and _ as wildcards (and \ as the
// escape), so a search for "50%" must mean the characters themselves.
export const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Runs `run` in one transaction. It commits unless `commit` says otherwise (then it rolls back and still
// returns the result) or `run` throws. BEGIN, COMMIT and ROLLBACK live in the managed withTransaction.
class RollBack<T> {
  constructor(readonly result: T) {}
}
export async function inTransaction<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
  commit: (result: T) => boolean = () => true,
): Promise<T> {
  try {
    return await withTransaction(pool, async (client: PoolClient) => {
      const result = await run(client);
      if (!commit(result)) throw new RollBack(result);
      return result;
    });
  } catch (error) {
    if (error instanceof RollBack) return error.result as T;
    throw error;
  }
}
