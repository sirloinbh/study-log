import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { removeStoredFiles } from '../src/exercise-files.js';
import { FileStorageError } from '../src/file-storage.js';
import { sweepOrphanedFiles } from '../src/file-sweep.js';

const now = new Date('2026-11-23T12:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

function setup(failRemove = false) {
  const objects = new Map<string, Date>([
    ['exercises/1/kept.pdf', ago(500)],
    ['exercises/1/orphan.pdf', ago(500)],
    ['exercises/2/fresh.pdf', ago(5)], // being stored right now: no row yet
  ]);
  const removed: string[] = [];
  const storage = {
    put: async () => undefined,
    get: async () => {
      throw new Error('unused');
    },
    remove: async (key: string) => {
      if (failRemove) throw new FileStorageError(502, 'File storage error');
      removed.push(key);
      objects.delete(key);
    },
    list: async () => [...objects].map(([key, lastModified]) => ({ key, lastModified })),
  };
  const pool = {
    query: async () => ({ rows: [{ key: 'exercises/1/kept.pdf' }] }),
  } as unknown as Pool;
  return { storage, pool, removed, objects };
}

test('the sweep removes only old files no row points at (#335)', async () => {
  const { storage, pool, removed, objects } = setup();
  const dry = await sweepOrphanedFiles(pool, storage, { now });
  assert.deepEqual(dry, { checked: 3, orphaned: ['exercises/1/orphan.pdf'], removed: [] });
  assert.deepEqual(removed, [], 'a dry run removes nothing');

  const applied = await sweepOrphanedFiles(pool, storage, { now, apply: true });
  assert.deepEqual(applied.removed, ['exercises/1/orphan.pdf']);
  assert.deepEqual([...objects.keys()].sort(), ['exercises/1/kept.pdf', 'exercises/2/fresh.pdf']);
});

test('a file the sweep cannot remove is not reported as removed (#335)', async () => {
  const { storage, pool } = setup(true);
  const original = console.error;
  console.error = () => undefined;
  try {
    const result = await sweepOrphanedFiles(pool, storage, { now, apply: true });
    assert.deepEqual(result.orphaned, ['exercises/1/orphan.pdf']);
    assert.deepEqual(result.removed, []);
  } finally {
    console.error = original;
  }
});

test('a storage that cannot list is refused (#335)', async () => {
  const { storage, pool } = setup();
  await assert.rejects(
    sweepOrphanedFiles(pool, { ...storage, list: undefined }, { now }),
    /cannot list/,
  );
});

test('a failed cleanup is logged as orphaned_files, never silent (#335)', async () => {
  const { storage } = setup(true);
  const lines: string[] = [];
  const original = console.error;
  console.error = (line: string) => void lines.push(line);
  try {
    assert.deepEqual(await removeStoredFiles(storage, ['exercises/9/x.pdf']), [
      'exercises/9/x.pdf',
    ]);
  } finally {
    console.error = original;
  }
  assert.equal(JSON.parse(lines[0]).event, 'orphaned_files');
});
