import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';

import type { Pool } from 'pg';

import { maxConcurrentClaudeCalls } from '../src/claude-call.js';
import { maxExtractionPages } from '../src/exercises.js';
import type { Extractor } from '../src/extraction.js';
import { countPdfPages } from '../src/pdf-pages.js';
import type { Translator } from '../src/translation.js';
import { withApi } from './helpers.js';

// A PDF whose page objects are written out in the file.
const plainPdf = (pages: number) =>
  Buffer.from(
    '%PDF-1.4\n' +
      '1 0 obj\n<< /Type /Pages /Count ' +
      pages +
      ' >>\nendobj\n' +
      Array.from(
        { length: pages },
        (_, i) => `${i + 2} 0 obj\n<< /Type /Page /Parent 1 0 R >>\nendobj\n`,
      ).join('') +
      '%%EOF',
    'latin1',
  );

// The same pages kept in a compressed object stream, as PDF 1.5 and later do.
const compressedPdf = (pages: number) => {
  const objects = Array.from({ length: pages }, () => '<< /Type /Page /Parent 1 0 R >>').join(' ');
  const body = deflateSync(Buffer.from(objects, 'latin1'));
  return Buffer.concat([
    Buffer.from('%PDF-1.5\n1 0 obj\n<< /Type /Pages /Count 0 >>\nendobj\n', 'latin1'),
    Buffer.from(
      `9 0 obj\n<< /Type /ObjStm /N ${pages} /First 0 /Filter /FlateDecode /Length ${body.length} >>\nstream\n`,
      'latin1',
    ),
    body,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
};

test('pages are counted in plain and in compressed PDFs (#267)', () => {
  assert.equal(countPdfPages(plainPdf(3)), 3);
  assert.equal(countPdfPages(compressedPdf(40)), 40);
  assert.equal(countPdfPages(Buffer.concat([plainPdf(2), compressedPdf(5)])), 7);
  assert.equal(countPdfPages(Buffer.from('%PDF-1.4\nnothing here')), undefined);
  assert.equal(
    countPdfPages(Buffer.from('%PDF-1.5\n<< /Type /ObjStm >>\nstream\nnot deflated\nendstream')),
    undefined,
  );
});

test('a crafted file full of object-stream markers is read quickly (#267)', () => {
  const started = performance.now();
  assert.equal(countPdfPages(Buffer.from('<</Type/ObjStm'.repeat(200_000), 'latin1')), undefined);
  assert.ok(performance.now() - started < 2000);
});

const chapterPool = {
  query: async () => ({ rows: [{}], rowCount: 1 }),
} as unknown as Pool;

const upload = (pdf: Buffer) => {
  const data = new FormData();
  data.append('kind', 'problems');
  data.append('file', new Blob([new Uint8Array(pdf)]), 'a.pdf');
  return data;
};
const app = { 'x-requested-with': 'study-log' };

test('a PDF over the page limit is refused before the extractor is called (#267)', async () => {
  let called = 0;
  const extractor: Extractor = async () => {
    called += 1;
    return { items: [], model: 'm' };
  };
  await withApi(
    chapterPool,
    async (call) => {
      const path = '/api/textbooks/1/contents/2/exercises/extract';
      const over = await call(path, {
        method: 'POST',
        form: upload(compressedPdf(maxExtractionPages + 1)),
        headers: app,
      });
      assert.deepEqual(
        [over.status, over.data.error],
        [
          400,
          `The PDF has ${maxExtractionPages + 1} pages. Read at most ${maxExtractionPages} pages at once`,
        ],
      );
      assert.equal(called, 0);
      const fine = await call(path, {
        method: 'POST',
        form: upload(plainPdf(maxExtractionPages)),
        headers: app,
      });
      assert.equal(fine.status, 200);
      assert.equal(called, 1);
    },
    { extractor },
  );
});

test('one extraction too many at once gets a 503 (#267)', async () => {
  let started = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const extractor: Extractor = async () => {
    started += 1;
    await held;
    return { items: [], model: 'm' };
  };
  await withApi(
    chapterPool,
    async (call) => {
      // Different chapters, so the same-chapter 409 does not apply.
      const send = (chapter: number) =>
        call(`/api/textbooks/1/contents/${chapter}/exercises/extract`, {
          method: 'POST',
          form: upload(plainPdf(1)),
          headers: app,
        });
      const inFlight = Array.from({ length: maxConcurrentClaudeCalls }, (_, i) => send(i + 1));
      while (started < maxConcurrentClaudeCalls) await new Promise((r) => setTimeout(r, 5));
      const extra = await send(99);
      assert.equal(extra.status, 503);
      assert.equal(extra.headers.get('retry-after'), '5');
      release();
      assert.deepEqual(
        (await Promise.all(inFlight)).map((r) => r.status),
        Array(maxConcurrentClaudeCalls).fill(200),
      );
      // The slots are free again.
      assert.equal((await send(99)).status, 200);
    },
    { extractor },
  );
});

test('translations share the same cap with extraction (#267)', async () => {
  let started = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const extractor: Extractor = async () => {
    started += 1;
    await held;
    return { items: [], model: 'm' };
  };
  const translator: Translator = async () => ({ body: '번역', answer: null, model: 'm' });
  const pool = {
    query: async (sql: string) =>
      sql.includes('FROM exercises e')
        ? { rows: [{ body: 'x', answer: null }], rowCount: 1 }
        : { rows: [{}], rowCount: 1 },
    connect: async () => ({
      query: async () => ({ rows: [], rowCount: 0 }),
      release: () => undefined,
    }),
  } as unknown as Pool;
  await withApi(
    pool,
    async (call) => {
      const inFlight = Array.from({ length: maxConcurrentClaudeCalls }, (_, i) =>
        call(`/api/textbooks/1/contents/${i + 1}/exercises/extract`, {
          method: 'POST',
          form: upload(plainPdf(1)),
          headers: app,
        }),
      );
      while (started < maxConcurrentClaudeCalls) await new Promise((r) => setTimeout(r, 5));
      const refused = await call('/api/exercises/7/translation', { method: 'POST', body: {} });
      assert.equal(refused.status, 503);
      release();
      await Promise.all(inFlight);
    },
    { extractor, translator },
  );
});
