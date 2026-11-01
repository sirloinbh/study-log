import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

import { checksum, migrate, readMigrations } from '../src/migrations.js';

const url = process.env.TEST_DATABASE_URL;
const dir = fileURLToPath(new URL('../../database/migrations/', import.meta.url));

// #134. Requires a dedicated test DB. Skipped (not passed) without it. Runs in its own schema, an
// empty database as far as the migrations can tell, so other test files keep their tables.
test('migrations apply to an empty database and can run again', { skip: !url }, async (t) => {
  const client = new Client({ connectionString: url });
  await client.connect();
  const schema = `migrate_test_${process.pid}`;
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  t.after(async () => {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  });

  const files = await readMigrations(dir);
  const names = files.map((file) => file.name);
  const tables = async () =>
    (
      await client.query<{ name: string }>(
        `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = $1`,
        [schema],
      )
    ).rows.map((row) => row.name);

  await t.test('every file is applied in order and recorded', async () => {
    assert.ok(names.length >= 12);
    assert.deepEqual(await migrate(client, files), names);
    const found = await tables();
    for (const table of ['study_logs', 'textbooks', 'exercises', 'reviews', 'schema_migrations'])
      assert.ok(found.includes(table), table);
    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM schema_migrations ORDER BY name',
    );
    assert.deepEqual(
      rows.map((row) => row.name),
      names,
    );
  });

  await t.test('running again applies nothing', async () => {
    assert.deepEqual(await migrate(client, files), []);
  });

  await t.test('a database set up before the history took each file once more', async () => {
    await client.query('DROP TABLE schema_migrations');
    const log = await client.query<{ id: number }>(
      `INSERT INTO study_logs (study_date, start_time, end_time, duration_minutes)
       VALUES ('2026-01-01', '09:00', '10:00', 60) RETURNING id`,
    );
    assert.deepEqual(await migrate(client, files), names);
    const { rowCount } = await client.query('SELECT 1 FROM study_logs WHERE id = $1', [
      log.rows[0].id,
    ]);
    assert.equal(rowCount, 1, 'existing data stays');
  });

  await t.test('a changed file stops before anything runs', async () => {
    const changed = files.map((file, index) =>
      index === 0 ? { ...file, sql: 'SELECT 2', checksum: checksum('SELECT 2') } : file,
    );
    await assert.rejects(migrate(client, changed), /내용이 바뀌었습니다: 001_initial\.sql/);
  });

  await t.test('a failing file rolls back alone, names itself and can be fixed', async () => {
    const good = {
      name: '900_good.sql',
      sql: 'CREATE TABLE migrate_good (id int)',
      checksum: checksum('good'),
    };
    const bad = {
      name: '901_bad.sql',
      sql: 'CREATE TABLE migrate_partial (id int); SELECT no_such_column FROM migrate_partial',
      checksum: checksum('bad'),
    };
    await assert.rejects(migrate(client, [...files, good, bad]), /901_bad\.sql 적용 실패/);
    const found = await tables();
    assert.ok(found.includes('migrate_good'), 'the earlier file stays');
    assert.ok(!found.includes('migrate_partial'), 'the failed file left nothing');
    const fixed = { ...bad, sql: 'CREATE TABLE migrate_partial (id int)' };
    assert.deepEqual(await migrate(client, [...files, good, fixed]), ['901_bad.sql']);
  });
});
