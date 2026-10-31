import type { Server } from 'node:http';

import { Client, type Pool } from 'pg';

import { createApp } from '../src/app.js';
import type { Translator } from '../src/translation.js';

// Ports the fetch standard refuses to connect to ("bad port"), as listed in the Fetch spec's
// port blocking. A random port from listen(0) can be one of them now and then (#56).
export const fetchBlockedPorts = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
]);

// Opens a listener until it gets a port fetch may call, closing each refused one first.
export async function openFetchablePort<T extends { port: number; close: () => Promise<void> }>(
  open: () => Promise<T>,
  tries = 10,
): Promise<T> {
  for (let attempt = 0; attempt < tries; attempt++) {
    const opened = await open();
    if (!fetchBlockedPorts.has(opened.port)) return opened;
    await opened.close();
  }
  throw new Error(`No port fetch may call after ${tries} tries`);
}

// Test files run in parallel on one DB. The few that compare totals over all rows take turns on
// this lock, held until the test ends. `finish` is the test's cleanup: it runs while the lock is
// held, and the lock is released even if it fails, or the other test would wait forever. The lock
// has its own connection, so closing the test's pool does not wait for it.
export async function holdExactTotalsLock(
  connectionString: string | undefined,
  t: { after: (run: () => Promise<void>) => void },
  finish: () => Promise<void>,
) {
  const client = new Client({ connectionString });
  await client.connect();
  t.after(async () => {
    try {
      await finish();
    } finally {
      await client.end();
    }
  });
  await client.query('SELECT pg_advisory_lock(424242)');
}

const closeServer = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

export async function withApi(
  pool: Pool,
  run: (
    call: (
      path: string,
      init?: {
        method?: string;
        body?: unknown;
        rawBody?: string;
        contentType?: string;
        headers?: Record<string, string>;
      },
    ) => Promise<{ status: number; data: Record<string, unknown> }>,
  ) => Promise<void>,
  options: { today?: () => string; translator?: Translator; requestsPerMinute?: number } = {},
) {
  const { server, port } = await openFetchablePort(async () => {
    // Tests never reach Claude: translating fails unless a test hands in its own translator (#31).
    const translator: Translator =
      options.translator ??
      (async () => {
        throw new Error('tests must not call the Claude API');
      });
    const server = createApp(pool, { ...options, translator }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      await closeServer(server);
      throw new Error('No TCP address');
    }
    return { server, port: address.port, close: () => closeServer(server) };
  });
  try {
    await run(async (path, init = {}) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          ...(init.body === undefined && init.rawBody === undefined
            ? {}
            : { 'content-type': init.contentType ?? 'application/json' }),
          ...init.headers,
        },
        body: init.rawBody ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
      });
      // 204 responses have no body.
      const text = await response.text();
      return {
        status: response.status,
        data: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
      };
    });
  } finally {
    await closeServer(server);
  }
}
