import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import type { Pool } from 'pg';

import {
  detectFormat,
  displayName,
  encodeName,
  maxBytesPerExercise,
  maxConcurrentUploads,
  maxFileBytes,
  maxFilesPerExercise,
  removeStoredFiles,
} from '../src/exercise-files.js';
import { FileStorageError, s3Storage } from '../src/file-storage.js';
import { withApi } from './helpers.js';

// Validation must reject an upload before it is stored (#28): the only query allowed is the check
// that the exercise exists, and S3 is never called (the helper's storage refuses).
// What the count of an exercise's files answers when it has none.
const empty = { rows: [{ files: 0, bytes: 0 }], rowCount: 1 };
const exercisePool = {
  query: async (sql: string) => {
    if (sql.startsWith('SELECT 1 FROM exercises')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('FROM exercise_files WHERE exercise_id')) return empty;
    throw new Error('DB must not be queried for invalid input');
  },
} as unknown as Pool;

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(32, 0x20)]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

const form = (bytes: Buffer, fields: Record<string, string> = { role: 'problem' }, name = 'a') => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  data.append('file', new Blob([new Uint8Array(bytes)]), name);
  return data;
};
const app = { 'x-requested-with': 'study-log' };

test('the file type is read from the first bytes, not the name (#28)', () => {
  assert.equal(detectFormat(pdf)?.type, 'application/pdf');
  assert.equal(detectFormat(png)?.type, 'image/png');
  assert.equal(detectFormat(jpeg)?.type, 'image/jpeg');
  assert.equal(detectFormat(Buffer.from('GIF89a')), undefined);
  assert.equal(detectFormat(Buffer.from('<html>%PDF-')), undefined);
  assert.equal(detectFormat(Buffer.from([0xff, 0xd8])), undefined);
  assert.equal(detectFormat(Buffer.alloc(0)), undefined);
});

test('file names lose control characters and never end up empty (#28)', () => {
  assert.equal(displayName('  1장 연습문제.pdf '), '1장 연습문제.pdf');
  assert.equal(displayName('a\u0000b\r\n.png'), 'ab.png');
  assert.equal(displayName(' \t '), 'file');
  assert.equal(displayName('report\u202efdp.exe'), 'reportfdp.exe');
  assert.equal(encodeName("1장 (풀이)'*.pdf"), '1%EC%9E%A5%20%28%ED%92%80%EC%9D%B4%29%27%2A.pdf');
});

test('an upload for a missing exercise is refused before its body is read or stored (#28)', async () => {
  const emptyPool = { query: async () => ({ rows: [], rowCount: 0 }) } as unknown as Pool;
  const refuse = async (): Promise<never> => {
    throw new Error('S3 must not be called for a missing exercise');
  };
  await withApi(
    emptyPool,
    async (call) => {
      // Not even a valid file: the body is never looked at.
      const { status, data } = await call('/api/exercises/7/files', {
        method: 'POST',
        form: form(Buffer.from('not read')),
        headers: app,
      });
      assert.deepEqual([status, data.error], [404, 'Exercise not found']);
    },
    { fileStorage: { put: refuse, get: refuse, remove: refuse } },
  );
});

test('uploads that are not allowed are refused before anything is stored (#28)', async () => {
  await withApi(exercisePool, async (call) => {
    const post = (init: { form?: FormData; headers?: Record<string, string>; path?: string }) =>
      call(init.path ?? '/api/exercises/1/files', {
        method: 'POST',
        form: init.form,
        headers: init.headers ?? app,
      });
    const cases: [Promise<{ status: number; data: Record<string, unknown> }>, number, RegExp][] = [
      // Another site's form cannot add the app's header.
      [post({ form: form(pdf), headers: {} }), 403, /Upload files from the study log app/],
      [
        call('/api/exercises/1/files', { method: 'POST', body: { role: 'problem' }, headers: app }),
        415,
        /multipart\/form-data/,
      ],
      [post({ form: form(pdf), path: '/api/exercises/0/files' }), 400, /Invalid exercise ID/],
      [post({ form: form(pdf, {}) }), 400, /problem or the answer/],
      [post({ form: form(pdf, { role: 'hint' }) }), 400, /must be problem or answer/],
      [post({ form: form(Buffer.alloc(0)) }), 400, /Choose a file/],
      [post({ form: form(Buffer.from('GIF89a....')) }), 415, /Only PDF, JPEG and PNG/],
      // A text file named like a PDF is still not a PDF.
      [post({ form: form(Buffer.from('hello'), undefined, 'a.pdf') }), 415, /Only PDF/],
      [
        post({ form: form(Buffer.concat([pdf, Buffer.alloc(maxFileBytes)])) }),
        413,
        /at most 20 MB/,
      ],
      [post({ form: form(pdf, undefined, 'x'.repeat(256)) }), 400, /at most 255 characters/],
      [
        call('/api/exercises/1/files', {
          method: 'POST',
          rawBody: '--nope\r\nbroken',
          contentType: 'multipart/form-data; boundary=other',
          headers: app,
        }),
        400,
        /Could not read the uploaded file/,
      ],
    ];
    for (const [request, status, message] of cases) {
      const response = await request;
      assert.equal(response.status, status, String(response.data.error));
      assert.match(String(response.data.error), message);
    }

    const two = form(pdf);
    two.append('file', new Blob([new Uint8Array(png)]), 'b.png');
    const otherField = new FormData();
    otherField.append('role', 'problem');
    otherField.append('photo', new Blob([new Uint8Array(png)]), 'b.png');
    for (const sent of [two, otherField]) {
      const { status, data } = await post({ form: sent });
      assert.equal(status, 400);
      assert.match(String(data.error), /Send one file in the file field/);
    }
  });
});

test('S3 storage refuses with a setup message until bucket and region are set (#28)', async () => {
  const neverSend = {
    send: async () => {
      throw new Error('must not reach S3');
    },
  };
  for (const settings of [{}, { bucket: 'b' }, { region: 'ap-northeast-2' }, { bucket: ' ' }]) {
    const storage = s3Storage(settings, neverSend);
    await assert.rejects(storage.put('k', pdf, 'application/pdf'), (error: unknown) => {
      assert.ok(error instanceof FileStorageError);
      assert.equal(error.status, 503);
      assert.match(error.message, /FILE_BUCKET and AWS_REGION/);
      return true;
    });
  }
});

test('S3 storage sends to the configured bucket and explains SDK failures (#28)', async () => {
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  let failWith: string | undefined;
  const client = {
    send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: command.constructor.name, input: command.input });
      if (failWith) throw Object.assign(new Error(failWith), { name: failWith });
      return { Body: Readable.from([png]) };
    },
  };
  const storage = s3Storage(
    { bucket: 'study-files', region: 'ap-northeast-2' },
    client as unknown as Parameters<typeof s3Storage>[1],
  );

  await storage.put('exercises/1/a.pdf', pdf, 'application/pdf');
  assert.deepEqual(await Readable.from(await storage.get('exercises/1/a.png')).toArray(), [png]);
  await storage.remove('exercises/1/a.pdf');
  assert.deepEqual(
    sent.map(({ name, input }) => [name, input.Bucket, input.Key, input.ContentType]),
    [
      ['PutObjectCommand', 'study-files', 'exercises/1/a.pdf', 'application/pdf'],
      ['GetObjectCommand', 'study-files', 'exercises/1/a.png', undefined],
      ['DeleteObjectCommand', 'study-files', 'exercises/1/a.pdf', undefined],
    ],
  );

  const cases: [string, number, RegExp][] = [
    ['NoSuchKey', 404, /stored file is missing/],
    ['CredentialsProviderError', 503, /credentials/],
    ['AccessDenied', 503, /refused the server credentials/],
    ['NoSuchBucket', 503, /FILE_BUCKET/],
    ['TimeoutError', 502, /File storage error/],
  ];
  for (const [name, status, message] of cases) {
    failWith = name;
    await assert.rejects(storage.get('k'), (error: unknown) => {
      assert.ok(error instanceof FileStorageError, name);
      assert.equal(error.status, status, name);
      assert.match(error.message, message);
      return true;
    });
  }
});

test('an S3 failure is logged once with its name and request ID, and no key (#262)', async () => {
  const client = {
    send: async () => {
      throw Object.assign(new Error('Slow down'), {
        name: 'SlowDown',
        $metadata: { requestId: 'REQ123', httpStatusCode: 503 },
      });
    },
  };
  const storage = s3Storage(
    { bucket: 'study-files', region: 'ap-northeast-2' },
    client as unknown as Parameters<typeof s3Storage>[1],
  );
  const lines: string[] = [];
  const original = console.error;
  console.error = (line: string) => void lines.push(line);
  try {
    await assert.rejects(storage.get('exercises/1/secret-name.pdf'), (error: unknown) => {
      assert.ok(error instanceof FileStorageError);
      assert.equal(error.status, 502);
      return true;
    });
  } finally {
    console.error = original;
  }
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.event, 'file_storage_failed');
  assert.equal(entry.error_name, 'SlowDown');
  assert.equal(entry.aws_request_id, 'REQ123');
  assert.equal(entry.http_status, 503);
  assert.doesNotMatch(lines[0], /secret-name|study-files/);
});

test('files that S3 will not remove are logged by key and never throw (#265)', async () => {
  const keys = Array.from({ length: 25 }, (_, i) => `exercises/${i}/a.pdf`);
  const removed: string[] = [];
  const storage = {
    put: async () => {},
    get: async () => Readable.from([]),
    // The second batch of ten fails as a whole; the first and third succeed.
    remove: async (key: string) => {
      const index = keys.indexOf(key);
      if (index >= 10 && index < 20) throw new FileStorageError(502, 'File storage error');
      removed.push(key);
    },
  };
  const lines: string[] = [];
  const original = console.error;
  console.error = (line: string) => void lines.push(line);
  let failed: string[];
  try {
    failed = await removeStoredFiles(storage, keys);
  } finally {
    console.error = original;
  }
  assert.deepEqual(failed, keys.slice(10, 20));
  assert.equal(removed.length, 15);
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.event, 'orphaned_files');
  assert.equal(entry.count, 10);
  assert.deepEqual(entry.keys, keys.slice(10, 20));
  assert.deepEqual(await removeStoredFiles(storage, []), []);
});

// A pool for the upload route: the exercise exists, it holds `held` files of `heldBytes`, and an
// insert succeeds. Transactions run on a client that answers from the same function.
function uploadPool(held = { files: 0, bytes: 0 }) {
  const answer = async (sql: string) => {
    if (sql.startsWith('SELECT 1 FROM exercises')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('FROM exercise_files WHERE exercise_id')) return { rows: [held], rowCount: 1 };
    if (sql.startsWith('INSERT INTO exercise_files')) return { rows: [{ id: 1 }], rowCount: 1 };
    return { rows: [], rowCount: 0 }; // BEGIN, COMMIT, ROLLBACK
  };
  return {
    query: answer,
    connect: async () => ({ query: answer, release: () => undefined }),
  } as unknown as Pool;
}

test('an exercise is limited in file count and in total size (#266)', async () => {
  const stored: string[] = [];
  const storage = {
    put: async (key: string) => void stored.push(key),
    get: async () => Readable.from([]),
    remove: async () => undefined,
  };
  const upload = async (pool: Pool) => {
    let outcome: readonly [number, unknown] = [0, undefined];
    await withApi(
      pool,
      async (call) => {
        const result = await call('/api/exercises/1/files', {
          method: 'POST',
          form: form(pdf),
          headers: app,
        });
        outcome = [result.status, result.data.error];
      },
      { fileStorage: storage },
    );
    return outcome;
  };

  const full = await upload(uploadPool({ files: maxFilesPerExercise, bytes: 10 }));
  assert.deepEqual(full, [409, `An exercise can hold at most ${maxFilesPerExercise} files`]);
  const heavy = await upload(uploadPool({ files: 1, bytes: maxBytesPerExercise - 1 }));
  assert.deepEqual(heavy, [413, 'The files of one exercise must total at most 100 MB']);
  assert.deepEqual(stored, [], 'nothing was stored for a refused upload');
  const fine = await upload(uploadPool({ files: maxFilesPerExercise - 1, bytes: 10 }));
  assert.deepEqual(fine, [201, undefined]);
  assert.equal(stored.length, 1);
});

test('one upload too many at once gets a 503 and the others go through (#266)', async () => {
  let started = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const storage = {
    put: async () => {
      started += 1;
      await held;
    },
    get: async () => Readable.from([]),
    remove: async () => undefined,
  };
  await withApi(
    uploadPool(),
    async (call) => {
      const send = () =>
        call('/api/exercises/1/files', { method: 'POST', form: form(pdf), headers: app });
      const inFlight = Array.from({ length: maxConcurrentUploads }, send);
      while (started < maxConcurrentUploads) await new Promise((r) => setTimeout(r, 5));
      // Every slot is busy with a stored file waiting: the next one is turned away at once.
      const extra = await send();
      assert.equal(extra.status, 503);
      assert.match(String(extra.data.error), /Too many uploads/);
      release();
      const statuses = (await Promise.all(inFlight)).map((r) => r.status);
      assert.deepEqual(statuses, Array(maxConcurrentUploads).fill(201));
      // The slots are free again.
      assert.equal((await send()).status, 201);
    },
    { fileStorage: storage },
  );
});

test('a stored file is streamed with a sandbox policy (#266)', async () => {
  const pool = {
    query: async () => ({
      rows: [{ key: 'k', name: 'a.pdf', type: 'application/pdf', size: pdf.length }],
      rowCount: 1,
    }),
  } as unknown as Pool;
  const storage = {
    put: async () => undefined,
    get: async () => Readable.from([pdf.subarray(0, 10), pdf.subarray(10)]),
    remove: async () => undefined,
  };
  await withApi(
    pool,
    async (call) => {
      const response = await call('/api/exercise-files/1/content');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-security-policy'), 'sandbox');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.deepEqual(response.bytes, pdf);
    },
    { fileStorage: storage },
  );
});
