import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from 'pg';
import { claudeTranslator, TranslationError, translationModel } from '../src/translation.js';
import { withApi } from './helpers.js';

// A stand-in for the SDK client: records each request and answers with `reply` (#31).
function fakeClient(reply: (params: Record<string, unknown>) => unknown) {
  const sent: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        create: async (params: Record<string, unknown>) => {
          sent.push(params);
          return reply(params);
        },
      },
    },
  } as unknown as Anthropic;
  return { client, sent };
}

const message = (text: string, stop_reason = 'end_turn') => ({
  model: translationModel,
  stop_reason,
  content: [
    { type: 'thinking', thinking: '' },
    { type: 'text', text },
  ],
});

test('an exercise and its answer go to Claude Sonnet 5.5 as tagged material (#31)', async () => {
  const { client, sent } = fakeClient(() =>
    message(JSON.stringify({ body: '행렬 $A$의 역행렬을 구하라.', answer: '$A^{-1}$' })),
  );
  const translated = await claudeTranslator(client)({
    body: 'Find the inverse of the matrix $A$.',
    answer: '$A^{-1}$',
  });
  assert.deepEqual(translated, {
    body: '행렬 $A$의 역행렬을 구하라.',
    answer: '$A^{-1}$',
    model: 'claude-sonnet-5-5',
  });
  const [params] = sent;
  assert.equal(params.model, 'claude-sonnet-5-5');
  assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(params.fallbacks, 'default');
  const config = params.output_config as { effort: string; format: { type: string } };
  assert.deepEqual([config.effort, config.format.type], ['low', 'json_schema']);
  assert.match(String(params.system), /Keep mathematical notation/);
  assert.deepEqual(params.messages, [
    {
      role: 'user',
      content:
        '<problem>\nFind the inverse of the matrix $A$.\n</problem>\n<answer>\n$A^{-1}$\n</answer>',
    },
  ]);
});

test('without an answer only the problem is sent and the answer stays null', async () => {
  const { client, sent } = fakeClient(() =>
    message(JSON.stringify({ body: '증명하라.', answer: '' })),
  );
  const translated = await claudeTranslator(client)({ body: 'Prove it.', answer: null });
  assert.equal(translated.answer, null);
  const [params] = sent;
  assert.doesNotMatch(JSON.stringify(params.messages), /<answer>/);
});

test('refusals, cut-off and unreadable replies and API failures become Korean errors', async () => {
  const cases: [() => unknown, number, RegExp][] = [
    [() => message('', 'refusal'), 422, /번역할 수 없습니다/],
    [() => message('{"body": "잘', 'max_tokens'), 502, /끝까지 받지 못했습니다/],
    [() => message('not json'), 502, /번역 결과를 읽지 못했습니다/],
    [() => message(JSON.stringify({ body: '  ', answer: '' })), 502, /번역 결과를 읽지 못했습니다/],
    [() => message(JSON.stringify({ body: '가'.repeat(40001), answer: '' })), 502, /너무 깁니다/],
    [
      () => {
        throw new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', new Headers());
      },
      503,
      /ANTHROPIC_API_KEY를 확인하세요/,
    ],
    [
      () => {
        throw new Anthropic.RateLimitError(429, {}, 'rate limited', new Headers());
      },
      429,
      /잠시 뒤 다시 시도하세요/,
    ],
    [
      () => {
        throw new Anthropic.InternalServerError(500, {}, 'overloaded', new Headers());
      },
      502,
      /번역 서비스 오류가 발생했습니다 \(500\)/,
    ],
    [
      () => {
        throw new Anthropic.APIConnectionError({ message: 'Connection error.' });
      },
      502,
      /연결하지 못했습니다/,
    ],
    [
      () => {
        // What the SDK throws when no key, token or profile is set: a plain Error.
        throw new Error(
          'Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set.',
        );
      },
      503,
      /ANTHROPIC_API_KEY\)가 서버에 설정되지 않았습니다/,
    ],
    [
      () => {
        throw new Anthropic.AnthropicError('Unexpected response');
      },
      502,
      /번역 서비스 오류가 발생했습니다$/,
    ],
  ];
  for (const [reply, status, error] of cases) {
    const { client } = fakeClient(reply);
    await assert.rejects(
      claudeTranslator(client)({ body: 'x', answer: null }),
      (thrown: unknown) =>
        thrown instanceof TranslationError &&
        thrown.status === status &&
        error.test(thrown.message),
    );
  }
});

const untouchedPool = {
  query: async () => {
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;

test('translation ids are checked and a missing exercise is a 404 before translating', async () => {
  await withApi(untouchedPool, async (call) => {
    for (const method of ['GET', 'POST']) {
      const { status, data } = await call('/api/exercises/0/translation', {
        method,
        body: method === 'POST' ? {} : undefined,
      });
      assert.equal(status, 400, method);
      assert.match(String(data.error), /연습문제 ID가 올바르지 않습니다/);
    }
  });
  let translated = 0;
  const empty = { query: async () => ({ rows: [], rowCount: 0 }) } as unknown as Pool;
  await withApi(
    empty,
    async (call) => {
      for (const method of ['GET', 'POST']) {
        const { status, data } = await call('/api/exercises/7/translation', {
          method,
          body: method === 'POST' ? {} : undefined,
        });
        assert.equal(status, 404, method);
        assert.equal(data.error, '연습문제를 찾을 수 없습니다');
      }
    },
    {
      translator: async () => {
        translated++;
        return { body: 'x', answer: null, model: 'm' };
      },
    },
  );
  assert.equal(translated, 0);
});

test('a failed translation answers its status and saves nothing', async () => {
  const sql: string[] = [];
  const pool = {
    query: async (text: string) => {
      sql.push(text.trim().split(/\s+/)[0]);
      return { rows: [{ body: 'Prove it.', answer: null }], rowCount: 1 };
    },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const { status, data } = await call('/api/exercises/7/translation', {
        method: 'POST',
        body: {},
      });
      assert.equal(status, 429);
      assert.equal(data.error, '번역 요청이 많습니다. 잠시 뒤 다시 시도하세요');
    },
    {
      translator: async () => {
        throw new TranslationError(429, '번역 요청이 많습니다. 잠시 뒤 다시 시도하세요');
      },
    },
  );
  assert.deepEqual(sql, ['SELECT']);
});

test('translating takes only JSON, and one request per exercise at a time', async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  const pool = {
    query: async (text: string) =>
      text.trim().startsWith('SELECT e.body')
        ? { rows: [{ body: 'Prove it.', answer: null }], rowCount: 1 }
        : text.trim().startsWith('INSERT')
          ? { rows: [], rowCount: 1 }
          : { rows: [{ body: '증명하라.', answer: null, stale: false }], rowCount: 1 },
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      // A form post or a no-cors fetch from another site sends no JSON: refused before anything.
      for (const init of [
        { method: 'POST' },
        { method: 'POST', rawBody: 'x=1', contentType: 'application/x-www-form-urlencoded' },
        { method: 'POST', rawBody: '{}', contentType: 'text/plain' },
      ]) {
        const { status, data } = await call('/api/exercises/7/translation', init);
        assert.equal(status, 415, JSON.stringify(init));
        assert.equal(data.error, '번역 요청은 JSON으로 보내세요');
      }
      assert.equal(calls, 0);
      // A second request while the first is translating is refused, not paid for again.
      const first = call('/api/exercises/7/translation', { method: 'POST', body: {} });
      while (calls === 0) await new Promise((r) => setImmediate(r));
      const second = await call('/api/exercises/7/translation', { method: 'POST', body: {} });
      assert.equal(second.status, 409);
      assert.equal(second.data.error, '이 문제는 이미 번역하는 중입니다');
      release();
      assert.equal((await first).status, 200);
      // Once done, the exercise can be translated again.
      assert.equal(
        (await call('/api/exercises/7/translation', { method: 'POST', body: {} })).status,
        200,
      );
      assert.equal(calls, 2);
    },
    {
      translator: async () => {
        calls++;
        if (calls === 1) await held;
        return { body: '증명하라.', answer: null, model: 'claude-sonnet-5-5' };
      },
    },
  );
});
