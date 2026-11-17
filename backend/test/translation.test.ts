import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';

import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from 'pg';

import { claudeExtractor, ExtractionError } from '../src/extraction.js';
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
    [() => message('', 'refusal'), 422, /cannot be translated/],
    [() => message('{"body": "잘', 'max_tokens'), 502, /too long to receive in full/],
    [() => message('not json'), 502, /Could not read the translation result/],
    [
      () => message(JSON.stringify({ body: '  ', answer: '' })),
      502,
      /Could not read the translation result/,
    ],
    [() => message(JSON.stringify({ body: '가'.repeat(40001), answer: '' })), 502, /too long/],
    [
      () => {
        throw new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', new Headers());
      },
      503,
      /Check ANTHROPIC_API_KEY/,
    ],
    [
      () => {
        throw new Anthropic.RateLimitError(429, {}, 'rate limited', new Headers());
      },
      429,
      /Try again in a moment/,
    ],
    [
      () => {
        throw new Anthropic.InternalServerError(500, {}, 'overloaded', new Headers());
      },
      502,
      /Translation service error \(500\)/,
    ],
    [
      () => {
        throw new Anthropic.APIConnectionError({ message: 'Connection error.' });
      },
      502,
      /Could not connect/,
    ],
    [
      () => {
        // What the SDK throws when no key, token or profile is set: a plain Error.
        throw new Error(
          'Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set.',
        );
      },
      503,
      /ANTHROPIC_API_KEY\) is not set on the server/,
    ],
    [
      () => {
        throw new Anthropic.AnthropicError('Unexpected response');
      },
      502,
      /Translation service error$/,
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
      assert.match(String(data.error), /Invalid exercise ID/);
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
        assert.equal(data.error, 'Exercise not found');
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
      assert.equal(data.error, 'Too many translation requests. Try again in a moment');
    },
    {
      translator: async () => {
        throw new TranslationError(429, 'Too many translation requests. Try again in a moment');
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
        assert.equal(data.error, 'Send the translation request as JSON');
      }
      assert.equal(calls, 0);
      // A second request while the first is translating is refused, not paid for again.
      const first = call('/api/exercises/7/translation', { method: 'POST', body: {} });
      while (calls === 0) await new Promise((r) => setImmediate(r));
      const second = await call('/api/exercises/7/translation', { method: 'POST', body: {} });
      assert.equal(second.status, 409);
      assert.equal(second.data.error, 'This problem is already being translated');
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

// The real SDK client with no credentials, so a change in what the SDK throws is caught (#224).
// A config folder with a CLI sign-in profile but no saved credentials stands in for the user's (as on
// a PC signed in with the Anthropic CLI), and the address refuses connections.
test('a missing key is reported as not set, with the real SDK client', async (t) => {
  const names = [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_PROFILE',
    'ANTHROPIC_IDENTITY_TOKEN',
    'ANTHROPIC_IDENTITY_TOKEN_FILE',
    'ANTHROPIC_FEDERATION_RULE_ID',
    'ANTHROPIC_CONFIG_DIR',
  ];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const empty = await mkdtemp(join(tmpdir(), 'anthropic-config-'));
  await mkdir(join(empty, 'configs'));
  await writeFile(
    join(empty, 'configs', 'default.json'),
    JSON.stringify({ authentication: { type: 'user_oauth' } }),
  );
  for (const name of names) delete process.env[name];
  process.env.ANTHROPIC_CONFIG_DIR = empty;
  t.after(async () => {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    await rm(empty, { recursive: true, force: true });
  });
  const client = () => new Anthropic({ baseURL: 'http://127.0.0.1:9', maxRetries: 0 });

  await assert.rejects(
    claudeTranslator(client())({ body: 'Prove it.', answer: null }),
    (thrown: unknown) =>
      thrown instanceof TranslationError &&
      thrown.status === 503 &&
      thrown.message === 'The translation API key (ANTHROPIC_API_KEY) is not set on the server',
  );
  await assert.rejects(
    claudeExtractor(client())({
      bytes: Buffer.from('%PDF-1.7'),
      type: 'application/pdf',
      kind: 'problems',
    }),
    (thrown: unknown) =>
      thrown instanceof ExtractionError &&
      thrown.status === 503 &&
      thrown.message === 'The extraction API key (ANTHROPIC_API_KEY) is not set on the server',
  );
});

// The usage log (#245): one JSON line per call, with the model and token counts but no text.
async function captureLogs(run: () => Promise<unknown>) {
  const logs: string[] = [];
  const errors: string[] = [];
  const log = mock.method(console, 'log', (line: string) => logs.push(line));
  const error = mock.method(console, 'error', (line: string) => errors.push(line));
  try {
    await run().catch(() => undefined);
  } finally {
    log.mock.restore();
    error.mock.restore();
  }
  return { logs, errors };
}

test('a successful call logs its model and token use, never the text (#245)', async () => {
  const { client } = fakeClient(() => ({
    ...message(JSON.stringify({ body: 'SECRET-TRANSLATION', answer: '' })),
    usage: { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 0 },
  }));
  const { logs, errors } = await captureLogs(() =>
    claudeTranslator(client)({ body: 'SECRET-PROBLEM', answer: null, requestId: 'req-2' }),
  );
  assert.equal(errors.length, 0);
  assert.equal(logs.length, 1);
  const line = JSON.parse(logs[0]) as Record<string, unknown>;
  assert.match(String(line.time), /^\d{4}-\d\d-\d\dT/);
  assert.equal(typeof line.ms, 'number');
  assert.deepEqual(
    { ...line, time: undefined, ms: undefined },
    {
      time: undefined,
      level: 'info',
      event: 'claude_call',
      requestId: 'req-2',
      feature: 'translation',
      model: 'claude-sonnet-5-5',
      input_tokens: 300,
      output_tokens: 40,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: null,
      stop_reason: 'end_turn',
      ms: undefined,
    },
  );
  assert.ok(!logs[0].includes('SECRET'));
});

test('a failed call logs its error type and status, not its message (#245)', async () => {
  const { client } = fakeClient(() => {
    throw new Anthropic.RateLimitError(429, {}, 'SECRET-ECHOED-PROMPT', new Headers());
  });
  const { logs, errors } = await captureLogs(() =>
    claudeTranslator(client)({ body: 'SECRET-PROBLEM', answer: null }),
  );
  assert.equal(logs.length, 0);
  assert.equal(errors.length, 1);
  const line = JSON.parse(errors[0]) as Record<string, unknown>;
  assert.equal(line.level, 'error');
  assert.equal(line.event, 'claude_call_failed');
  assert.equal(line.feature, 'translation');
  assert.equal(line.model, 'claude-sonnet-5-5');
  assert.equal(line.error_type, 'RateLimitError');
  assert.equal(line.status, 429);
  assert.equal(typeof line.ms, 'number');
  assert.ok(!errors[0].includes('SECRET'));
});
