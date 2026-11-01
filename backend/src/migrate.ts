import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';

import { migrate, readMigrations } from './migrations.js';

// Applies pending migrations: `node dist/migrate.js` in a deploy (deploy/remote-deploy.sh, which
// mounts the files at /database/migrations) and `npm run db:migrate` on the host. From both dist and
// src this path is the repository's database/migrations, or that mount.
const dir = fileURLToPath(new URL('../../database/migrations/', import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL이 필요합니다. .env를 확인하세요.');
  process.exit(1);
}
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  const applied = await migrate(client, await readMigrations(dir));
  console.log(
    applied.length ? `적용 완료: ${applied.join(', ')}` : '적용할 마이그레이션이 없습니다.',
  );
} catch (error) {
  // A deploy stops on this exit code, before it starts the new version.
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
