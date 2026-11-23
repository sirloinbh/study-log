import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { defaultUrl, problemInput } from '../src/coding-problems.js';
import { withApi } from './helpers.js';

// Validation must reject input before any query reaches the database.
const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;

test('invalid problems and attempts are rejected with English messages', async () => {
  const good = { site: 'baekjoon', problemKey: '1000', title: 'A+B' };
  const cases: [unknown, RegExp][] = [
    [{}, /The site must be baekjoon, leetcode, or other/],
    [{ ...good, problemKey: '' }, /Enter the problem ID/],
    [{ ...good, problemKey: 'abc' }, /digits only/],
    [{ ...good, site: 'leetcode', problemKey: 'Two Sum' }, /title slug/],
    [{ ...good, title: ' ' }, /Enter the problem title/],
    [{ ...good, title: 'a\nb' }, /must be on one line/],
    [{ ...good, url: 'javascript:alert(1)' }, /must start with http/],
    [{ ...good, url: 'data:text/html,hi' }, /must start with http/],
    [{ ...good, attempt: { result: 'won' } }, /The result must be solved, partial, or failed/],
    [{ ...good, attempt: { result: 'solved', minutes: 0 } }, /whole number from 1 to 1439/],
    [{ ...good, attempt: { result: 'solved', minutes: 1.5 } }, /whole number from 1 to 1439/],
    [{ ...good, attempt: { result: 'solved', date: '2026-02-30' } }, /This date does not exist/],
    [
      { ...good, attempt: { result: 'solved', studyLog: { startTime: '09:00' } } },
      /Enter the minutes to also record a study log/,
    ],
    [['x'], /Send the problem as a JSON object/],
  ];
  await withApi(untouchedPool, async (call) => {
    for (const [body, message] of cases) {
      const { status, data } = await call('/api/coding/problems', { method: 'POST', body });
      assert.equal(status, 400, JSON.stringify(body).slice(0, 80));
      assert.match(String(data.error), message);
    }
    for (const [path, message] of [
      ['/api/coding/problems?site=gitlab', /The site must be/],
      ['/api/coding/problems?result=won', /The result must be/],
      ['/api/coding/problems?from=2026-10-23&to=2026-10-01', /start date cannot be after/],
      ['/api/coding/problems?limit=201', /at most 200/],
      ['/api/coding/problems/01', /Invalid problem ID/],
    ] as const) {
      const { status, data } = await call(path);
      assert.equal(status, 400, path);
      assert.match(String(data.error), message);
    }
    const attempt = await call('/api/coding/problems/1/attempts', {
      method: 'POST',
      body: { result: 'solved', studyLog: { startTime: '25:00' }, minutes: 5 },
    });
    assert.equal(attempt.status, 400);
    const edit = await call('/api/coding/attempts/1', {
      method: 'PUT',
      body: { result: 'solved', minutes: 1440 },
    });
    assert.equal(edit.status, 400);
  });
});

test('a LeetCode slug is lower-cased and each site gets its own link', () => {
  const parsed = problemInput.parse({
    site: 'leetcode',
    problemKey: ' Two-Sum ',
    title: 'Two Sum',
  });
  assert.equal(parsed.problemKey, 'two-sum');
  assert.equal(defaultUrl('baekjoon', '1000'), 'https://www.acmicpc.net/problem/1000');
  assert.equal(defaultUrl('leetcode', 'two-sum'), 'https://leetcode.com/problems/two-sum/');
  assert.equal(defaultUrl('other', 'x'), null);
});
