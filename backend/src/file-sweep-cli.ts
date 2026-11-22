// `npm run files:sweep -w backend` lists the stored files no row points at and what it would remove;
// add `--apply` to remove them (#335). It deletes real objects when pointed at the real bucket, so
// the default is a dry run.
import { s3Storage } from './file-storage.js';
import { sweepOrphanedFiles } from './file-sweep.js';
import { connectPool } from './pool.js';

const apply = process.argv.includes('--apply');
const pool = connectPool(process.env.DATABASE_URL);
try {
  const result = await sweepOrphanedFiles(pool, s3Storage(), { apply });
  console.log(
    JSON.stringify({
      event: 'file_sweep',
      mode: apply ? 'apply' : 'dry-run',
      checked: result.checked,
      orphaned: result.orphaned.length,
      removed: result.removed.length,
      keys: result.orphaned,
    }),
  );
} finally {
  await pool.end();
}
