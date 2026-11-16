import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAuthMiddleware } from '@sirloinbh/auth-client';
import type { Pool } from 'pg';

import { withApi } from './helpers.js';

// #221: the shared sign-in guards /api. A fake auth service stands in for sirloinbh/shared-auth
// and a fake pool for PostgreSQL, so these run without either.
const user = { id: 'u1', email: 'me@example.com', name: 'Me', image: null };
const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;

function fakeAuth() {
  let checks = 0;
  const auth = createAuthMiddleware({
    authUrl: 'http://shared-auth-api:3110',
    fetch: async (_url, init) => {
      checks++;
      const cookie = (init?.headers as Record<string, string> | undefined)?.cookie ?? '';
      const ok = cookie.includes('sirloinbh.session_token=good');
      return { ok: true, status: 200, json: async () => (ok ? { user } : null) };
    },
  });
  return { auth, checks: () => checks };
}

const signedIn = { headers: { cookie: 'sirloinbh.session_token=good' } };

test('without a session every /api path but /api/health is 401', async () => {
  const { auth, checks } = fakeAuth();
  await withApi(
    pool,
    async (call) => {
      assert.equal((await call('/api/health')).status, 200);
      for (const path of [
        '/api/me',
        '/api/study-logs',
        '/api/textbooks',
        '/api/exercise-files/1',
        '/api/no-such-path',
      ]) {
        const { status, data } = await call(path);
        assert.equal(status, 401, path);
        assert.deepEqual(data, { error: 'unauthorized' });
      }
      assert.equal(checks(), 0, 'no cookie, so the auth service is not asked');
      const bad = await call('/api/textbooks', {
        headers: { cookie: 'sirloinbh.session_token=bad' },
      });
      assert.equal(bad.status, 401);
    },
    { auth },
  );
});

test('with a session the API answers and /api/me returns the user', async () => {
  const { auth } = fakeAuth();
  await withApi(
    pool,
    async (call) => {
      const me = await call('/api/me', signedIn);
      assert.equal(me.status, 200);
      assert.deepEqual(me.data, { user });
      assert.equal((await call('/api/textbooks', signedIn)).status, 200);
    },
    { auth },
  );
});
