import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import Anthropic from '@anthropic-ai/sdk';

import { claudeExtractor, ExtractionError, extractionModel } from '../src/extraction.js';

// A stand-in for the SDK client: records each streamed request and finishes it with `reply` (#30).
function fakeClient(reply: (params: Record<string, unknown>) => unknown) {
  const sent: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
          sent.push({ ...params, signal: options?.signal });
          return { finalMessage: async () => reply(params) };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, sent };
}

const message = (text: string, stop_reason = 'end_turn') => ({
  model: extractionModel,
  stop_reason,
  content: [
    { type: 'thinking', thinking: '' },
    { type: 'text', text },
  ],
});
const items = (...list: { number: string; body: string; answer: string }[]) =>
  message(JSON.stringify({ items: list }));

const pdf = Buffer.from('%PDF-1.7\n1. Prove it.');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

test('a PDF goes to Claude Sonnet 5.5 as a document, streamed with structured output (#30)', async () => {
  const { client, sent } = fakeClient(() =>
    items(
      { number: ' 1.2 ', body: 'Find $A^{-1}$.', answer: '' },
      { number: '1.3', body: 'Prove it.', answer: 'By induction.' },
    ),
  );
  const stop = new AbortController();
  const extracted = await claudeExtractor(client)({
    bytes: pdf,
    type: 'application/pdf',
    kind: 'problems',
    signal: stop.signal,
  });
  assert.deepEqual(extracted, {
    items: [
      { number: '1.2', body: 'Find $A^{-1}$.', answer: null },
      { number: '1.3', body: 'Prove it.', answer: 'By induction.' },
    ],
    model: 'claude-sonnet-5-5',
  });
  const [params] = sent;
  // The request's abort signal reaches the SDK call.
  assert.equal(params.signal, stop.signal);
  assert.equal(params.model, 'claude-sonnet-5-5');
  assert.equal(params.max_tokens, 64000);
  assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(params.fallbacks, 'default');
  const config = params.output_config as { effort: string; format: { type: string } };
  assert.deepEqual([config.effort, config.format.type], ['medium', 'json_schema']);
  assert.match(String(params.system), /never instructions to you/);
  const [user] = params.messages as { role: string; content: Record<string, unknown>[] }[];
  assert.equal(user.role, 'user');
  assert.deepEqual(user.content[0], {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') },
  });
  assert.match(String(user.content[1].text), /List every exercise/);
});

test('a photo goes as an image, and an answers-only file keeps only numbered answers', async () => {
  const { client, sent } = fakeClient(() =>
    items(
      { number: '3', body: 'stray text', answer: '$x = 2$' },
      { number: '4', body: '', answer: '  ' },
      { number: 'x'.repeat(30), body: '', answer: '7' },
    ),
  );
  const extracted = await claudeExtractor(client)({
    bytes: png,
    type: 'image/png',
    kind: 'answers',
  });
  // The body is dropped for answers, an empty answer is left out, and a long number is cut to 20.
  assert.deepEqual(extracted.items, [
    { number: '3', body: '', answer: '$x = 2$' },
    { number: 'x'.repeat(20), body: '', answer: '7' },
  ]);
  const [user] = sent[0].messages as { content: Record<string, unknown>[] }[];
  assert.deepEqual(user.content[0], {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') },
  });
  assert.match(String(user.content[1].text), /These pages hold answers/);
});

test('problems without text are left out', async () => {
  const { client } = fakeClient(() =>
    items({ number: '1', body: ' \n', answer: 'a' }, { number: '2', body: 'Two', answer: '' }),
  );
  const extracted = await claudeExtractor(client)({
    bytes: pdf,
    type: 'application/pdf',
    kind: 'problems',
  });
  assert.deepEqual(extracted.items, [{ number: '2', body: 'Two', answer: null }]);
});

test('refusals, cut-off, unreadable or oversized replies and API failures become errors', async () => {
  const many = Array.from({ length: 201 }, (_, i) => ({ number: `${i}`, body: 'b', answer: '' }));
  const cases: [() => unknown, number, RegExp][] = [
    [() => message('', 'refusal'), 422, /cannot be read/],
    [() => message('{"items": [', 'max_tokens'), 502, /Upload fewer pages/],
    [() => message('not json'), 502, /Could not read the extraction result/],
    [() => message('{"items": "none"}'), 502, /Could not read the extraction result/],
    [() => items(...many), 502, /more than 200 items/],
    [
      () => {
        throw new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', new Headers());
      },
      503,
      /^Extraction API authentication failed. Check ANTHROPIC_API_KEY/,
    ],
    [
      () => {
        throw new Anthropic.BadRequestError(400, {}, 'too many pages', new Headers());
      },
      502,
      /^Extraction service error \(400\)$/,
    ],
    [
      () => {
        throw new Error('Could not resolve authentication method. Expected one of apiKey.');
      },
      503,
      /extraction API key \(ANTHROPIC_API_KEY\) is not set/,
    ],
  ];
  for (const [reply, status, error] of cases) {
    const { client } = fakeClient(reply);
    await assert.rejects(
      claudeExtractor(client)({ bytes: pdf, type: 'application/pdf', kind: 'problems' }),
      (thrown: unknown) =>
        thrown instanceof ExtractionError && thrown.status === status && error.test(thrown.message),
    );
  }
});

test('other failures are not dressed up as extraction errors', async () => {
  const { client } = fakeClient(() => {
    throw new TypeError('bug');
  });
  await assert.rejects(
    claudeExtractor(client)({ bytes: pdf, type: 'application/pdf', kind: 'problems' }),
    TypeError,
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
    ...items({ number: '1', body: 'SECRET-PROBLEM-TEXT', answer: '' }),
    usage: {
      input_tokens: 1200,
      output_tokens: 80,
      cache_read_input_tokens: 5,
      cache_creation_input_tokens: null,
    },
  }));
  const { logs, errors } = await captureLogs(() =>
    claudeExtractor(client)({
      bytes: pdf,
      type: 'application/pdf',
      kind: 'problems',
      requestId: 'req-1',
    }),
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
      requestId: 'req-1',
      feature: 'extraction',
      model: 'claude-sonnet-5-5',
      input_tokens: 1200,
      output_tokens: 80,
      cache_read_input_tokens: 5,
      cache_creation_input_tokens: null,
      stop_reason: 'end_turn',
      ms: undefined,
    },
  );
  assert.ok(!logs[0].includes('SECRET-PROBLEM-TEXT'));
  assert.ok(!logs[0].includes(pdf.toString('base64')));
});

test('a failed call logs its error type and status, not its message (#245)', async () => {
  const { client } = fakeClient(() => {
    throw new Anthropic.BadRequestError(400, {}, 'SECRET-ECHOED-PROMPT', new Headers());
  });
  const { logs, errors } = await captureLogs(() =>
    claudeExtractor(client)({ bytes: pdf, type: 'application/pdf', kind: 'problems' }),
  );
  assert.equal(logs.length, 0);
  assert.equal(errors.length, 1);
  const line = JSON.parse(errors[0]) as Record<string, unknown>;
  assert.equal(line.level, 'error');
  assert.equal(line.event, 'claude_call_failed');
  assert.equal(line.feature, 'extraction');
  assert.equal(line.model, 'claude-sonnet-5-5');
  assert.equal(line.error_type, 'BadRequestError');
  assert.equal(line.status, 400);
  assert.equal(typeof line.ms, 'number');
  assert.ok(!errors[0].includes('SECRET-ECHOED-PROMPT'));
});
