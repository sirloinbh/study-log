import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { type LeetCodeClient, leetCodeClient, LeetCodeError } from '../src/leetcode.js';
import { withApi } from './helpers.js';

const reply = (status: number, body: unknown) =>
  (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
    })) as typeof fetch;

test('the client reads recent accepted submissions and a difficulty', async () => {
  const sent: { url: string; body: { query: string; variables: object }; agent: string | null }[] =
    [];
  const client = leetCodeClient((async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { query: string; variables: object };
    sent.push({ url, body, agent: new Headers(init.headers).get('user-agent') });
    return new Response(
      JSON.stringify(
        body.query.includes('recentAcSubmissionList')
          ? {
              data: {
                recentAcSubmissionList: [
                  { id: '1', title: ' Two Sum ', titleSlug: 'two-sum', timestamp: '1700000000' },
                ],
              },
            }
          : { data: { question: { difficulty: 'Medium' } } },
      ),
    );
  }) as unknown as typeof fetch);
  assert.deepEqual(await client.recentAccepted('some_user'), [
    { slug: 'two-sum', title: 'Two Sum', timestamp: 1700000000 },
  ]);
  assert.equal(await client.difficulty('two-sum'), 'Medium');
  assert.equal(sent[0].url, 'https://leetcode.com/graphql');
  assert.deepEqual(sent[0].body.variables, { username: 'some_user', limit: 50 });
  assert.match(sent[0].agent ?? '', /^study-log/);
});

test('a hidden profile or unknown problem is empty, and bad answers are refused', async () => {
  assert.deepEqual(
    await leetCodeClient(reply(200, { data: { recentAcSubmissionList: null } })).recentAccepted(
      'x',
    ),
    [],
  );
  assert.equal(
    await leetCodeClient(reply(200, { data: { question: null } })).difficulty('nope'),
    undefined,
  );
  await assert.rejects(
    leetCodeClient(reply(200, { data: { question: { difficulty: 'Brutal' } } })).difficulty('a'),
    LeetCodeError,
  );
  await assert.rejects(
    leetCodeClient(
      reply(200, {
        data: { recentAcSubmissionList: [{ title: 't', titleSlug: 'Bad Slug', timestamp: 1 }] },
      }),
    ).recentAccepted('x'),
    LeetCodeError,
  );
  await assert.rejects(leetCodeClient(reply(200, '<html>')).difficulty('a'), /cannot read/);
  await assert.rejects(leetCodeClient(reply(403, '')).difficulty('a'), /status 403/);
  await assert.rejects(leetCodeClient(reply(429, '')).difficulty('a'), /slow down/);
  const down = leetCodeClient((async () => {
    throw new Error('connect ECONNREFUSED https://leetcode.com/graphql');
  }) as typeof fetch);
  await assert.rejects(down.difficulty('a'), (error: Error) => {
    assert.ok(error instanceof LeetCodeError);
    assert.doesNotMatch(error.message, /leetcode\.com/);
    return true;
  });
});

const never = {
  query: async () => {
    throw new Error('DB must not be queried here');
  },
} as unknown as Pool;

test('the import needs a valid username and a failed lookup stops it before the database changes', async () => {
  const fake: LeetCodeClient = {
    recentAccepted: async () => [{ slug: 'two-sum', title: 'Two Sum', timestamp: 1700000000 }],
    difficulty: async () => {
      throw new LeetCodeError('Could not reach LeetCode. Try again in a moment');
    },
  };
  await withApi(
    never,
    async (call) => {
      const missing = await call('/api/coding/leetcode/import', { method: 'POST' });
      assert.equal(missing.status, 503);
      assert.match(String(missing.data.error), /LEETCODE_USERNAME/);
    },
    { leetCodeClient: fake },
  );
  await withApi(
    never,
    async (call) => {
      const bad = await call('/api/coding/leetcode/import', { method: 'POST' });
      assert.match(String(bad.data.error), /not valid/);
    },
    { leetCodeClient: fake, leetCodeUsername: 'bad name!' },
  );
  const statements: string[] = [];
  const pool = {
    query: async (text: string) => {
      statements.push(text);
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const down = await call('/api/coding/leetcode/import', { method: 'POST' });
      assert.equal(down.status, 503);
      assert.match(String(down.data.error), /Could not reach LeetCode/);
    },
    { leetCodeClient: fake, leetCodeUsername: 'some_user' },
  );
  assert.ok(
    statements.every((text) => !/INSERT INTO coding/.test(text)),
    'nothing was written',
  );
});

test('the import adds one solved attempt per new problem, dated in the service time zone', async () => {
  const lookups: string[] = [];
  const fake: LeetCodeClient = {
    // 2023-11-14 15:30 UTC is 2023-11-15 00:30 in Seoul; two-sum was accepted twice.
    recentAccepted: async () => [
      { slug: 'two-sum', title: 'Two Sum', timestamp: 1700004600 },
      { slug: 'add-two-numbers', title: 'Add Two Numbers', timestamp: 1700100000 },
      { slug: 'two-sum', title: 'Two Sum', timestamp: 1700200000 },
      { slug: 'known', title: 'Known', timestamp: 1700300000 },
    ],
    difficulty: async (slug) => {
      lookups.push(slug);
      return 'Easy';
    },
  };
  const inserts: { text: string; values: unknown[] }[] = [];
  let nextId = 1;
  const pool = {
    query: async (text: string, values: unknown[] = []) => {
      if (/SELECT problem_key/.test(text)) return { rows: [{ key: 'known' }], rowCount: 1 };
      if (/INSERT INTO coding_problems/.test(text)) {
        inserts.push({ text, values });
        return { rows: [{ id: nextId++ }], rowCount: 1 };
      }
      if (/INSERT INTO coding_attempts/.test(text)) inserts.push({ text, values });
      return { rows: [], rowCount: 1 };
    },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const done = await call('/api/coding/leetcode/import', { method: 'POST' });
      assert.equal(done.status, 200);
      assert.deepEqual(done.data, { added: 2, skipped: 1, total: 3 });
    },
    { leetCodeClient: fake, leetCodeUsername: 'some_user' },
  );
  assert.deepEqual(lookups, ['two-sum', 'add-two-numbers'], 'recorded problems are not looked up');
  const attempts = inserts.filter((insert) => /coding_attempts/.test(insert.text));
  assert.deepEqual(
    attempts.map((insert) => insert.values),
    [
      [1, '2023-11-15'],
      [2, '2023-11-16'],
    ],
    'the first accepted submission gives the date',
  );
});
