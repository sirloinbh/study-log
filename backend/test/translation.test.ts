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
      const { status, data } = await call('/api/exercises/0/translation', { method });
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
        const { status, data } = await call('/api/exercises/7/translation', { method });
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
      const { status, data } = await call('/api/exercises/7/translation', { method: 'POST' });
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
