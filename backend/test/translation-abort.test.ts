import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import type { Translator } from '../src/translation.js';

test('a translation whose request is abandoned is aborted, not saved, and frees its slot (#337)', async () => {
  const queries: string[] = [];
  const answer = async (sql: string) => {
    queries.push(sql);
    return sql.includes('FROM exercises e')
      ? { rows: [{ body: 'x', answer: null }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
  };
  const pool = {
    query: answer,
    connect: async () => ({ query: answer, release: () => undefined }),
  } as unknown as Pool;

  let sawSignal: AbortSignal | undefined;
  let started!: () => void;
  const running = new Promise<void>((resolve) => (started = resolve));
  let aborted!: () => void;
  const wasAborted = new Promise<void>((resolve) => (aborted = resolve));
  let mode: 'wait' | 'finish' = 'wait';
  const translator: Translator = async (source) => {
    if (mode === 'finish') return { body: '번역', answer: null, model: 'm' };
    sawSignal = source.signal;
    source.signal?.addEventListener('abort', aborted);
    started();
    await wasAborted;
    throw new Error('aborted');
  };

  const server = createApp(pool, { translator }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const post = () =>
      request({
        host: '127.0.0.1',
        port,
        path: '/api/exercises/7/translation',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
    const abandoned = post();
    abandoned.on('error', () => undefined);
    abandoned.end('{}');
    await running;
    assert.equal(sawSignal?.aborted, false);
    abandoned.destroy(); // the tab is closed
    await wasAborted;
    assert.equal(sawSignal?.aborted, true);
    // Give the route a moment to finish; it must not have written anything.
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      queries.some((sql) => sql.includes('INSERT INTO exercise_translations')),
      false,
    );

    // The slot and the per-exercise lock are free again: the same exercise translates now.
    mode = 'finish';
    const status = await new Promise<number>((resolve, reject) => {
      const next = post();
      next.on('response', (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      next.on('error', reject);
      next.end('{}');
    });
    assert.notEqual(status, 409);
    assert.notEqual(status, 503);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
