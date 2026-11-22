import type { Pool } from 'pg';

import { removeStoredFiles } from './exercise-files.js';
import type { FileStorage } from './file-storage.js';

// Removes stored files that no row points at (#335): copies a delete could not remove (logged as
// `orphaned_files`, #265) and uploads whose cleanup failed. A key counts only when it is older than
// the grace period, so a file that is being stored right now, before its row is inserted, is safe.
// Without `apply` it only reports what it would remove.
export const sweepPrefix = 'exercises/';
export const defaultGraceMs = 60 * 60 * 1000;

export type SweepResult = { checked: number; orphaned: string[]; removed: string[] };

export async function sweepOrphanedFiles(
  pool: Pick<Pool, 'query'>,
  storage: FileStorage,
  options: { apply?: boolean; graceMs?: number; now?: Date } = {},
): Promise<SweepResult> {
  if (!storage.list) throw new Error('This file storage cannot list its files');
  const cutoff = (options.now ?? new Date()).getTime() - (options.graceMs ?? defaultGraceMs);
  const objects = await storage.list(sweepPrefix);
  const { rows } = await pool.query<{ key: string }>(
    'SELECT storage_key AS key FROM exercise_files',
  );
  const referenced = new Set(rows.map((row) => row.key));
  // The rows are read after the listing, so a file stored and inserted in between is in `referenced`.
  const orphaned = objects
    .filter((object) => !referenced.has(object.key) && object.lastModified.getTime() < cutoff)
    .map((object) => object.key);
  const failed = options.apply ? await removeStoredFiles(storage, orphaned) : orphaned;
  const removed = options.apply ? orphaned.filter((key) => !failed.includes(key)) : [];
  return { checked: objects.length, orphaned, removed };
}
