import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { type SolvedAcClient, solvedAcClient, SolvedAcError } from '../src/solvedac.js';
import { withApi } from './helpers.js';

const reply = (status: number, body: unknown) =>
  (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
    })) as typeof fetch;

const raw = (id: number, extra: object = {}) => ({
  problemId: id,
  titleKo: `Problem ${id}`,
  level: 1,
  tags: [{ key: 'math', isMeta: false }, { key: 'implementation' }],
  ...extra,
});

test('the client reads a problem, checks the answer and keeps no more than it needs', async () => {
  let asked = '';
  const client = solvedAcClient((async (url: string, init: RequestInit) => {
    asked = `${url}|${new Headers(init.headers).get('user-agent')}`;
    return new Response(JSON.stringify(raw(1000, { titleKo: `  ${'가'.repeat(300)}  ` })));
  }) as unknown as typeof fetch);
  const problem = await client.problem(1000);
  assert.equal(problem?.id, 1000);
  assert.equal(problem?.title.length, 200, 'a long title is cut');
  assert.deepEqual(problem?.tags, ['math', 'implementation']);
  assert.match(asked, /problem\/show\?problemId=1000\|study-log/);

  assert.equal(await solvedAcClient(reply(404, '{}')).problem(1), undefined);
  // An answer for another problem, a bad shape and a non-JSON body are all refused.
  await assert.rejects(solvedAcClient(reply(200, raw(7))).problem(1000), SolvedAcError);
  await assert.rejects(solvedAcClient(reply(200, { problemId: 'x' })).problem(1), SolvedAcError);
  await assert.rejects(solvedAcClient(reply(200, '<html>')).problem(1), /cannot read/);
  await assert.rejects(solvedAcClient(reply(200, raw(1, { level: 99 }))).problem(1), SolvedAcError);
});

test('blocked, slow-down and unreachable answers become short messages with no URL in them', async () => {
  await assert.rejects(
    solvedAcClient(reply(403, '<html>challenge</html>')).problem(1),
    /status 403/,
  );
  await assert.rejects(solvedAcClient(reply(429, '')).problem(1), /slow down/);
  const down = solvedAcClient((async () => {
    throw new Error('connect ECONNREFUSED https://solved.ac/api/v3/secret');
  }) as typeof fetch);
  await assert.rejects(down.problem(1), (error: Error) => {
    assert.ok(error instanceof SolvedAcError);
    assert.doesNotMatch(error.message, /solved\.ac\/api/);
    return true;
  });
});

test('the search page is asked for by handle in id order', async () => {
  let path = '';
  const client = solvedAcClient((async (url: string) => {
    path = url;
    return new Response(JSON.stringify({ count: 1, items: [raw(1000)] }));
  }) as unknown as typeof fetch);
  const result = await client.solvedPage('some_user', 2);
  assert.equal(result.total, 1);
  assert.match(path, /query=solved_by%3Asome_user&sort=id&direction=asc&page=2/);
});

const never = {
  query: async () => {
    throw new Error('DB must not be queried here');
  },
} as unknown as Pool;

test('the lookup route validates the number and reports solved.ac failures as 503', async () => {
  const fake: SolvedAcClient = {
    problem: async (id) =>
      id === 1000
        ? { id, title: 'A+B', level: 1, tags: ['math'] }
        : id === 2
          ? undefined
          : Promise.reject(new SolvedAcError('Could not reach solved.ac. Try again in a moment')),
    solvedPage: async () => ({ total: 0, items: [] }),
  };
  await withApi(
    never,
    async (call) => {
      assert.equal((await call('/api/coding/solvedac/problems/abc')).status, 400);
      assert.equal((await call('/api/coding/solvedac/problems/0')).status, 400);
      const found = await call('/api/coding/solvedac/problems/1000');
      assert.equal(found.status, 200);
      assert.deepEqual(found.data.problem, {
        id: 1000,
        title: 'A+B',
        level: 1,
        tags: ['math'],
        url: 'https://www.acmicpc.net/problem/1000',
      });
      assert.equal((await call('/api/coding/solvedac/problems/2')).status, 404);
      const down = await call('/api/coding/solvedac/problems/3');
      assert.equal(down.status, 503);
      assert.match(String(down.data.error), /Could not reach solved\.ac/);
    },
    { solvedAcClient: fake },
  );
});

test('the import needs a valid handle and reads every page before touching the database', async () => {
  const pages: number[] = [];
  const fake: SolvedAcClient = {
    problem: async () => undefined,
    solvedPage: async (handle, page) => {
      pages.push(page);
      assert.equal(handle, 'some_user');
      const first = (page - 1) * 50 + 1;
      const count = page === 1 ? 50 : 3;
      return {
        total: 53,
        items: Array.from({ length: count }, (_, i) => ({
          id: first + i,
          title: `P${first + i}`,
          level: 3,
          tags: ['dp'],
        })),
      };
    },
  };
  const statements: { text: string; values?: unknown[] }[] = [];
  const pool = {
    query: async (text: string, values?: unknown[]) => {
      statements.push({ text, values });
      return { rows: [], rowCount: 40 };
    },
  } as unknown as Pool;

  await withApi(
    never,
    async (call) => {
      const missing = await call('/api/coding/solvedac/import', { method: 'POST' });
      assert.equal(missing.status, 503);
      assert.match(String(missing.data.error), /SOLVEDAC_HANDLE/);
    },
    { solvedAcClient: fake },
  );
  await withApi(
    never,
    async (call) => {
      const bad = await call('/api/coding/solvedac/import', { method: 'POST' });
      assert.equal(bad.status, 503);
      assert.match(String(bad.data.error), /not valid/);
    },
    { solvedAcClient: fake, solvedAcHandle: 'bad handle!' },
  );

  await withApi(
    pool,
    async (call) => {
      const done = await call('/api/coding/solvedac/import', { method: 'POST' });
      assert.equal(done.status, 200);
      assert.deepEqual(done.data, { added: 40, skipped: 13, total: 53 });
    },
    { solvedAcClient: fake, solvedAcHandle: 'some_user' },
  );
  assert.deepEqual(pages, [1, 2]);
  const insert = statements.find((s) => /INSERT INTO coding_problems/.test(s.text));
  assert.ok(insert);
  assert.match(insert.text, /ON CONFLICT \(site, problem_key\) DO NOTHING/);
  assert.equal((insert.values?.[0] as string[]).length, 53);
});
