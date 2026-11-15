import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { ExtractionError, type ExtractionSource, type Extractor } from '../src/extraction.js';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

const pdf = Buffer.from('%PDF-1.7\n1.2 Find the inverse.');
const app = { 'x-requested-with': 'study-log' };
const form = (bytes: Buffer, kind?: string) => {
  const data = new FormData();
  if (kind !== undefined) data.append('kind', kind);
  data.append('file', new Blob([new Uint8Array(bytes)]), 'page.pdf');
  return data;
};

type Exercise = { id: number; number: string; body: string; important: boolean };

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'a file is read for review, then the problems and answers are saved all or nothing (#30)',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const prefix = '[통합테스트 추출]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });
    // Answers what the test sets; records what it was asked to read.
    const asked: ExtractionSource[] = [];
    let answer: () => Promise<Awaited<ReturnType<Extractor>>> = async () => ({
      items: [{ number: '1.2', body: 'Find the inverse.', answer: null }],
      model: 'claude-sonnet-5-5',
    });
    const extractor: Extractor = (source) => {
      asked.push(source);
      return answer();
    };

    await withApi(
      pool,
      async (call) => {
        const book = (
          await call('/api/textbooks', { method: 'POST', body: { title: `${prefix} 선형대수` } })
        ).data.textbook as { id: number };
        const add = async (title: string) =>
          (
            (
              await call(`/api/textbooks/${book.id}/contents`, {
                method: 'POST',
                body: { title },
              })
            ).data.content as { id: number }
          ).id;
        const chapter = await add('1장');
        const other = await add('2장');
        const base = `/api/textbooks/${book.id}/contents/${chapter}/exercises`;
        const extract = (data: FormData, path = base, headers: Record<string, string> = app) =>
          call(`${path}/extract`, { method: 'POST', form: data, headers });

        // Reading: the app header, multipart, an existing chapter, a kind and a known format.
        assert.equal((await extract(form(pdf, 'problems'), base, {})).status, 403);
        assert.equal(
          (await call(`${base}/extract`, { method: 'POST', body: {}, headers: app })).status,
          415,
        );
        const missing = await extract(
          form(pdf, 'problems'),
          `/api/textbooks/${book.id}/contents/999999999/exercises`,
        );
        assert.deepEqual(
          [missing.status, missing.data],
          [404, { error: 'Contents entry not found' }],
        );
        assert.equal((await extract(form(pdf))).status, 400);
        const text = await extract(form(Buffer.from('plain text'), 'problems'));
        assert.deepEqual(
          [text.status, text.data],
          [415, { error: 'Only PDF, JPEG and PNG files can be read' }],
        );
        assert.equal(asked.length, 0);

        const read = await extract(form(pdf, 'problems'));
        assert.equal(read.status, 200);
        assert.deepEqual(read.data, {
          items: [{ number: '1.2', body: 'Find the inverse.', answer: null }],
          model: 'claude-sonnet-5-5',
        });
        const { signal, ...source } = asked[0];
        assert.deepEqual(
          { ...source, bytes: source.bytes.toString() },
          { bytes: pdf.toString(), type: 'application/pdf', kind: 'problems' },
        );
        // The call gets a signal that stays unused once the reply is sent.
        assert.ok(signal instanceof AbortSignal);
        assert.equal(signal.aborted, false);
        // Reading saves nothing.
        assert.deepEqual((await call(base)).data, { exercises: [] });

        // A failure answers with its status; a second request while one is running waits its turn.
        answer = async () => {
          throw new ExtractionError(503, 'Extraction API authentication failed');
        };
        const failed = await extract(form(pdf, 'answers'));
        assert.deepEqual(
          [failed.status, failed.data],
          [503, { error: 'Extraction API authentication failed' }],
        );
        let release = () => {};
        answer = () =>
          new Promise((resolve) => {
            release = () => resolve({ items: [], model: 'claude-sonnet-5-5' });
          });
        const first = extract(form(pdf, 'problems'));
        while (asked.length < 3) await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal((await extract(form(pdf, 'problems'))).status, 409);
        release();
        assert.equal((await first).status, 200);

        // Saving problems: all or nothing. A NUL in the second one fails the whole batch.
        const bulk = (exercises: unknown[], path = base) =>
          call(`${path}/bulk`, { method: 'POST', body: { exercises } });
        assert.equal((await bulk([])).status, 400);
        const broken = await bulk([
          { number: '1', body: 'One' },
          { number: '2', body: 'Two\u0000' },
        ]);
        assert.equal(broken.status, 400);
        assert.deepEqual((await call(base)).data, { exercises: [] });
        assert.equal(
          (await bulk([{ body: 'x' }], `/api/textbooks/${book.id}/contents/999999999/exercises`))
            .status,
          404,
        );

        const saved = await bulk([
          { number: '1.1', body: 'Add the vectors.', answer: '(3, 4)' },
          { number: '1.2', body: 'Find the inverse.', answer: null, important: true },
        ]);
        assert.equal(saved.status, 201);
        const list = saved.data.exercises as Exercise[];
        assert.deepEqual(
          list.map(({ number, body, important }) => ({ number, body, important })),
          [
            { number: '1.1', body: 'Add the vectors.', important: false },
            { number: '1.2', body: 'Find the inverse.', important: true },
          ],
        );
        const [first11, first12] = list;
        const answerOf = async (id: number) => (await call(`/api/exercises/${id}/answer`)).data;
        assert.deepEqual(await answerOf(first11.id), {
          answer: { exerciseId: first11.id, body: '(3, 4)' },
        });
        assert.deepEqual(await answerOf(first12.id), { answer: null });

        // Saving answers: matched to this chapter's exercises, replacing what is there.
        const answers = (list: unknown[], path = base) =>
          call(`${path}/answers`, { method: 'PUT', body: { answers: list } });
        const elsewhere = (
          await call(`/api/textbooks/${book.id}/contents/${other}/exercises`, {
            method: 'POST',
            body: { body: 'Elsewhere' },
          })
        ).data.exercise as Exercise;
        const outside = await answers([
          { exerciseId: first12.id, body: 'A^{-1}' },
          { exerciseId: elsewhere.id, body: 'no' },
        ]);
        assert.deepEqual(
          [outside.status, outside.data],
          [400, { error: 'Some problems are no longer in this section. Reload and match again' }],
        );
        assert.deepEqual(await answerOf(first12.id), { answer: null });
        const twice = await answers([
          { exerciseId: first12.id, body: 'a' },
          { exerciseId: first12.id, body: 'b' },
        ]);
        assert.deepEqual(
          [twice.status, twice.data],
          [400, { error: 'Two answers are matched to the same problem' }],
        );

        const stored = await answers([
          { exerciseId: first11.id, body: '(3, 4) again' },
          { exerciseId: first12.id, body: '$A^{-1}$' },
        ]);
        assert.deepEqual([stored.status, stored.data], [200, { saved: 2 }]);
        assert.deepEqual(await answerOf(first11.id), {
          answer: { exerciseId: first11.id, body: '(3, 4) again' },
        });
        assert.deepEqual(await answerOf(first12.id), {
          answer: { exerciseId: first12.id, body: '$A^{-1}$' },
        });
        assert.equal(
          (
            await answers(
              [{ exerciseId: first11.id, body: 'x' }],
              `/api/textbooks/${book.id}/contents/999999999/exercises`,
            )
          ).status,
          404,
        );

        // A whole chapter may be larger than other requests: /bulk takes 2 MB, the rest 256 KB.
        const long = Array.from({ length: 20 }, (_, i) => ({
          number: `9.${i}`,
          body: 'x'.repeat(15000),
        }));
        assert.equal((await bulk(long)).status, 201);
        const savedLong = (await call(base)).data.exercises as Exercise[];
        const bigAnswers = savedLong
          .filter((exercise) => exercise.number.startsWith('9.'))
          .map((exercise) => ({ exerciseId: exercise.id, body: 'y'.repeat(15000) }));
        assert.deepEqual((await answers(bigAnswers)).data, { saved: 20 });
        const tooLarge = await call(`/api/exercises/${first11.id}`, {
          method: 'PUT',
          body: { number: '1.1', body: 'x'.repeat(300000) },
        });
        assert.deepEqual(
          [tooLarge.status, tooLarge.data],
          [413, { error: 'Request body is too large' }],
        );
      },
      { extractor },
    );
  },
);
