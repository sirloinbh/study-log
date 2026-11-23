import type { Server } from 'node:http';

import type express from 'express';
import { Client, type Pool, Pool as RealPool } from 'pg';

import { createApp } from '../src/app.js';
import type { Feedbacker } from '../src/exercise-feedback.js';
import type { Extractor } from '../src/extraction.js';
import type { FileStorage } from '../src/file-storage.js';
import type { HolidayFetcher } from '../src/holidays.js';
import type { LeetCodeClient } from '../src/leetcode.js';
import type { Drafter } from '../src/retrospective-draft.js';
import type { SolvedAcClient } from '../src/solvedac.js';
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

// A hand-made pool (not a real pg Pool) is changed in two ways, because the routes write in
// transactions and every change leaves an audit row (#263): one with only `query` gets a `connect`,
// and the clients it hands out answer the audit insert (and, for a pool with only `query`, BEGIN,
// COMMIT and ROLLBACK) on their own, so a test sees only the statements it cares about. A real Pool
// is used as it is: the integration tests read the audit rows.
const isAudit = (text: string) => /INSERT INTO audit_log/.test(text);
const isTransactionStatement = (text: string) => /^\s*(BEGIN|COMMIT|ROLLBACK)\b/.test(text);
type Query = (text: string, values?: unknown[]) => Promise<unknown>;
export function withTransactions(pool: Pool): Pool {
  if (pool instanceof RealPool) return pool;
  type Client = { query: Query; release: () => void };
  const fake = pool as unknown as { query: Query; connect?: () => Promise<Client> };
  const connect = fake.connect;
  const quiet =
    (query: Query, onlyAudit: boolean): Query =>
    (text, values) =>
      isAudit(text) || (!onlyAudit && isTransactionStatement(text))
        ? Promise.resolve({ rows: [], rowCount: 0 })
        : query(text, values);
  const poolQuery: Query = (text, values) => (fake.query as Query).call(pool, text, values);
  return Object.assign(Object.create(pool) as Pool, {
    connect: async () => {
      if (connect) {
        const client: Client = await connect.call(pool);
        return Object.assign(Object.create(client), {
          query: quiet(client.query.bind(client), true),
        });
      }
      return { query: quiet(poolQuery, false), release: () => undefined };
    },
  });
}

export async function withApi(
  pool: Pool,
  run: (
    call: (
      path: string,
      init?: {
        method?: string;
        body?: unknown;
        rawBody?: string;
        form?: FormData;
        contentType?: string;
        headers?: Record<string, string>;
      },
    ) => Promise<{
      status: number;
      data: Record<string, unknown>;
      headers: Headers;
      bytes: Buffer;
    }>,
  ) => Promise<void>,
  options: {
    today?: () => string;
    translator?: Translator;
    drafter?: Drafter;
    extractor?: Extractor;
    feedbacker?: Feedbacker;
    holidayFetcher?: HolidayFetcher;
    fileStorage?: FileStorage;
    requestsPerMinute?: number;
    auth?: express.RequestHandler;
    scheduleCatchUp?: boolean;
    solvedAcClient?: SolvedAcClient;
    solvedAcHandle?: string;
    leetCodeClient?: LeetCodeClient;
    leetCodeUsername?: string;
  } = {},
) {
  const { server, port } = await openFetchablePort(async () => {
    // Tests never reach Claude: translating fails unless a test hands in its own translator (#31).
    const translator: Translator =
      options.translator ??
      (async () => {
        throw new Error('tests must not call the Claude API');
      });
    // Nor for retrospective drafts (#362).
    const drafter: Drafter =
      options.drafter ??
      (async () => {
        throw new Error('tests must not call the Claude API');
      });
    // Nor for reading files (#30).
    const extractor: Extractor =
      options.extractor ??
      (async () => {
        throw new Error('tests must not call the Claude API');
      });
    // Nor for feedback on solutions (#363).
    const feedbacker: Feedbacker =
      options.feedbacker ??
      (async () => {
        throw new Error('tests must not call the Claude API');
      });
    // Nor the holiday API, in the same way (#34).
    const holidayFetcher: HolidayFetcher =
      options.holidayFetcher ??
      (async () => {
        throw new Error('tests must not call the holiday API');
      });
    // Nor S3 (#28).
    const refuse = async (): Promise<never> => {
      throw new Error('tests must not call S3');
    };
    const fileStorage: FileStorage = options.fileStorage ?? {
      put: refuse,
      get: refuse,
      remove: refuse,
    };
    // Nor solved.ac (#369).
    const solvedAc: SolvedAcClient = options.solvedAcClient ?? {
      problem: async () => {
        throw new Error('tests must not call solved.ac');
      },
      solvedPage: async () => {
        throw new Error('tests must not call solved.ac');
      },
    };
    // Nor LeetCode (#370).
    const leetCode: LeetCodeClient = options.leetCodeClient ?? {
      recentAccepted: async () => {
        throw new Error('tests must not call LeetCode');
      },
      difficulty: async () => {
        throw new Error('tests must not call LeetCode');
      },
    };
    const server = createApp(withTransactions(pool), {
      ...options,
      solvedAcClient: solvedAc,
      leetCodeClient: leetCode,
      translator,
      drafter,
      extractor,
      feedbacker,
      holidayFetcher,
      fileStorage,
    }).listen(0, '127.0.0.1');
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
        // A form sets its own multipart content type and boundary (#28).
        body:
          init.form ??
          init.rawBody ??
          (init.body === undefined ? undefined : JSON.stringify(init.body)),
      });
      // 204 responses have no body; a stored file (#28) is not JSON.
      const bytes = Buffer.from(await response.arrayBuffer());
      const json = response.headers.get('content-type')?.includes('application/json');
      return {
        status: response.status,
        data: (json && bytes.length ? JSON.parse(bytes.toString('utf8')) : {}) as Record<
          string,
          unknown
        >,
        headers: response.headers,
        bytes,
      };
    });
  } finally {
    await closeServer(server);
  }
}
