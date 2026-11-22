import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import {
  detectFormat,
  displayName,
  encodeName,
  maxFileBytes,
  removeStoredFiles,
} from '../src/exercise-files.js';
import { FileStorageError, s3Storage } from '../src/file-storage.js';
import { withApi } from './helpers.js';

// Validation must reject an upload before it is stored (#28): the only query allowed is the check
// that the exercise exists, and S3 is never called (the helper's storage refuses).
const exercisePool = {
  query: async (sql: string) => {
    if (sql.startsWith('SELECT 1 FROM exercises')) return { rows: [{}], rowCount: 1 };
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
      return { Body: { transformToByteArray: async () => new Uint8Array(png) } };
    },
  };
  const storage = s3Storage(
    { bucket: 'study-files', region: 'ap-northeast-2' },
    client as unknown as Parameters<typeof s3Storage>[1],
  );

  await storage.put('exercises/1/a.pdf', pdf, 'application/pdf');
  assert.deepEqual(await storage.get('exercises/1/a.png'), png);
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
    get: async () => Buffer.alloc(0),
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
