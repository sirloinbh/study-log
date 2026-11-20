import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { test } from 'node:test';

import { Pool } from 'pg';

import { createApp } from '../src/app.js';

// project-standards#711: shared-ai calls the AI tool with a signed token; each call is checked for its scope
// and leaves one audit_log row.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
// One owner per run, so the audit rows of an earlier run on the same DB do not count.
const owner = `owner-${randomUUID()}`;
// A token names its tool ('@list' for the list) and has its own jti; the app requires both.
function token(scope: string, tool: string, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'EdDSA', typ: 'JWT' })}.${b64({ iss: 'shared-ai', aud: 'study-log', sub: owner, client: 'stdio', scope, tool, jti: randomUUID(), iat: now, exp: now + 60 })}`;
  return `${body}.${sign(null, Buffer.from(body), key).toString('base64url')}`;
}

test(
  'AI tool: list study logs with scopes, signatures and audit rows',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const toolsPublicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const server = createApp(pool, { toolsPublicKey }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/internal/tools`;
    const call = (name: string, auth: string | null, body: unknown = {}) =>
      fetch(`${base}/${name}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(auth ? { authorization: `Bearer ${auth}` } : {}),
        },
        body: JSON.stringify(body),
      });
    const name = `AI-${randomUUID()}`;
    const {
      rows: [seeded],
    } = await pool.query<{ id: number }>(
      "INSERT INTO study_logs (study_date, start_time, end_time, duration_minutes, memo) VALUES ('2040-04-01', '09:00', '10:00', 60, $1) RETURNING id",
      [name],
    );
    try {
      const listed = await fetch(base, {
        headers: { authorization: `Bearer ${token('study-log:read', '@list')}` },
      });
      assert.equal(listed.status, 200);
      const { tools } = (await listed.json()) as {
        tools: { name: string; annotations: { readOnlyHint: boolean } }[];
      };
      assert.deepEqual(
        tools.map((t) => [t.name, t.annotations.readOnlyHint]),
        [['list_study_logs', true]],
      );

      assert.equal((await call('list_study_logs', null)).status, 401);
      assert.equal(
        (
          await call(
            'list_study_logs',
            token('study-log:read', 'list_study_logs', generateKeyPairSync('ed25519').privateKey),
          )
        ).status,
        401,
      );
      assert.equal(
        (await call('list_study_logs', token('study-log:write', 'list_study_logs'))).status,
        403,
      );

      const read = await call('list_study_logs', token('study-log:read', 'list_study_logs'), {
        from: '2040-04-01',
        to: '2040-04-01',
        limit: 100,
      });
      assert.equal(read.status, 200);
      const { result } = (await read.json()) as { result: { id: number; memo: string }[] };
      assert.equal(result.find((log) => log.id === seeded!.id)?.memo, name);
      assert.equal(
        (
          await call('list_study_logs', token('study-log:read', 'list_study_logs'), {
            limit: 500,
          })
        ).status,
        400,
      );

      const rows = (
        await pool.query(
          "SELECT action,result,tool,entity,client,actor_type FROM audit_log WHERE actor_type='ai-tool' AND actor_id=$1 ORDER BY id",
          [owner],
        )
      ).rows;
      assert.deepEqual(
        rows.map((r) => [r.tool, r.action, r.result]),
        [
          ['list_study_logs', 'read', 'denied'],
          ['list_study_logs', 'read', 'ok'],
          ['list_study_logs', 'read', 'error'],
        ],
      );
      assert.equal(rows[1].entity, 'study_log');
      assert.equal(rows[1].client, 'stdio');
    } finally {
      await pool.query('DELETE FROM study_logs WHERE id = $1', [seeded!.id]);
      server.close();
      await pool.end();
    }
  },
);

test(
  'AI tools are off without the shared-ai public key',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const server = createApp(pool).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    try {
      assert.equal((await fetch(`http://127.0.0.1:${address.port}/internal/tools`)).status, 404);
    } finally {
      server.close();
      await pool.end();
    }
  },
);
