import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import { Pool } from 'pg';

import { storedKeys } from '../src/exercise-files.js';
import { type FileStorage, FileStorageError } from '../src/file-storage.js';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

type StoredFile = {
  id: number;
  exerciseId: number;
  role: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
};

// An in-memory S3 that can be told to fail, so tests never call AWS (#28).
function memoryStorage() {
  const objects = new Map<string, { body: Buffer; type: string }>();
  const failing = { put: false, remove: false };
  const storage: FileStorage = {
    put: async (key, body, type) => {
      if (failing.put) throw new FileStorageError(503, 'File storage is not set up');
      objects.set(key, { body, type });
    },
    get: async (key) => {
      const object = objects.get(key);
      if (!object) throw new FileStorageError(404, 'The stored file is missing');
      return Readable.from([object.body]);
    },
    remove: async (key) => {
      if (failing.remove) throw new FileStorageError(502, 'File storage error');
      objects.delete(key);
    },
  };
  return { storage, objects, failing };
}

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('문제 1.2 원본')]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const app = { 'x-requested-with': 'study-log' };
const form = (bytes: Buffer, role: string, name: string) => {
  const data = new FormData();
  data.append('role', role);
  data.append('file', new Blob([new Uint8Array(bytes)]), name);
  return data;
};

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'problem and answer files are stored in S3, listed, read back and deleted with their row',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const prefix = '[통합테스트 파일]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });
    const { storage, objects, failing } = memoryStorage();

    await withApi(
      pool,
      async (call) => {
        const book = (
          await call('/api/textbooks', { method: 'POST', body: { title: `${prefix} 선형대수` } })
        ).data.textbook as { id: number };
        const content = (
          await call(`/api/textbooks/${book.id}/contents`, {
            method: 'POST',
            body: { title: '1장' },
          })
        ).data.content as { id: number };
        const exercise = (
          await call(`/api/textbooks/${book.id}/contents/${content.id}/exercises`, {
            method: 'POST',
            body: { number: '1.2', body: '행렬 A의 역행렬을 구하라.' },
          })
        ).data.exercise as { id: number };
        const files = `/api/exercises/${exercise.id}/files`;
        const upload = (bytes: Buffer, role: string, name: string, path = files) =>
          call(path, { method: 'POST', form: form(bytes, role, name), headers: app });

        assert.deepEqual((await call(files)).data, { files: [] });

        const problem = await upload(pdf, 'problem', '1장 문제.pdf');
        assert.equal(problem.status, 201);
        const saved = problem.data.file as StoredFile;
        assert.deepEqual(
          { ...saved, id: 0, createdAt: '' },
          {
            id: 0,
            exerciseId: exercise.id,
            role: 'problem',
            name: '1장 문제.pdf',
            contentType: 'application/pdf',
            size: pdf.length,
            createdAt: '',
          },
        );
        assert.match(saved.createdAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
        // The type comes from the bytes: a PNG sent with a .jpg name is stored as a PNG.
        const answer = (await upload(png, 'answer', '답.jpg')).data.file as StoredFile;
        assert.equal(answer.contentType, 'image/png');

        // Each file is its own S3 object under the exercise, named by a random id, not the name.
        const keys = [...objects.keys()];
        assert.equal(keys.length, 2);
        for (const key of keys)
          assert.match(key, new RegExp(`^exercises/${exercise.id}/[0-9a-f-]{36}\\.(pdf|png)$`));

        const listed = (await call(files)).data.files as StoredFile[];
        assert.deepEqual(
          listed.map((file) => [file.id, file.role, file.name]),
          [
            [saved.id, 'problem', '1장 문제.pdf'],
            [answer.id, 'answer', '답.jpg'],
          ],
        );
        assert.deepEqual((await call(`/api/exercise-files/${saved.id}`)).data.file, saved);

        const read = await call(`/api/exercise-files/${saved.id}/content`);
        assert.equal(read.status, 200);
        assert.deepEqual(read.bytes, pdf);
        assert.equal(read.headers.get('content-type'), 'application/pdf');
        assert.equal(read.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(
          read.headers.get('content-disposition'),
          `inline; filename*=UTF-8''${encodeURIComponent('1장 문제.pdf')}`,
        );

        // Unknown exercise or file.
        assert.equal((await call('/api/exercises/999999999999/files')).status, 404);
        const missing = await upload(pdf, 'problem', 'a.pdf', '/api/exercises/999999999999/files');
        assert.deepEqual([missing.status, missing.data.error], [404, 'Exercise not found']);
        assert.equal(objects.size, 2, 'nothing is stored for an exercise that does not exist');
        for (const path of ['', '/content'])
          assert.equal((await call(`/api/exercise-files/999999999999${path}`)).status, 404);

        // A storage failure answers with its own status and saves no row.
        failing.put = true;
        const refused = await upload(pdf, 'problem', 'b.pdf');
        assert.deepEqual([refused.status, refused.data.error], [503, 'File storage is not set up']);
        failing.put = false;
        assert.equal(((await call(files)).data.files as StoredFile[]).length, 2);

        // Deleting commits the row first (#335); when S3 then refuses, the delete still stands, no row
        // points at a missing file, and the key left behind is logged for the sweep.
        failing.remove = true;
        const logged: string[] = [];
        const original = console.error;
        console.error = (line: string) => void logged.push(line);
        try {
          assert.equal(
            (await call(`/api/exercise-files/${answer.id}`, { method: 'DELETE' })).status,
            204,
          );
        } finally {
          console.error = original;
          failing.remove = false;
        }
        assert.equal(((await call(files)).data.files as StoredFile[]).length, 1);
        assert.equal((await call(`/api/exercise-files/${answer.id}`)).status, 404);
        assert.equal(objects.size, 2);
        const orphaned = logged
          .map((line) => JSON.parse(line))
          .find((l) => l.event === 'orphaned_files');
        assert.equal(orphaned?.keys.length, 1);
        objects.delete(orphaned.keys[0]); // the sweep removes it
        assert.equal(objects.size, 1);

        // A row whose object is gone answers 404 for the content, not a server error.
        objects.clear();
        const gone = await call(`/api/exercise-files/${saved.id}/content`);
        assert.deepEqual([gone.status, gone.data.error], [404, 'The stored file is missing']);

        // Rows go with their exercise.
        await call(`/api/exercises/${exercise.id}`, { method: 'DELETE' });
        const left = await pool.query('SELECT 1 FROM exercise_files WHERE exercise_id = $1', [
          exercise.id,
        ]);
        assert.equal(left.rowCount, 0);
      },
      { fileStorage: storage },
    );
  },
);

test(
  'deleting an exercise, chapter or textbook removes its stored files, or nothing (#209)',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const prefix = '[통합테스트 파일 정리]';
    const cleanup = async () => {
      await pool.query(
        `DELETE FROM study_logs WHERE textbook_id IN (SELECT id FROM textbooks WHERE title LIKE $1)`,
        [`${prefix}%`],
      );
      await pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    };
    await cleanup();
    t.after(async () => {
      await cleanup();
      await pool.end();
    });
    const { storage, objects, failing } = memoryStorage();

    await withApi(
      pool,
      async (call) => {
        const post = async (path: string, body: unknown, field: string) =>
          ((await call(path, { method: 'POST', body })).data[field] as { id: number }).id;
        const book = await post('/api/textbooks', { title: `${prefix} 선형대수` }, 'textbook');
        const contents = `/api/textbooks/${book}/contents`;
        const chapter = await post(contents, { title: '1장' }, 'content');
        const section = await post(contents, { title: '1.1', parentId: chapter }, 'content');
        const other = await post(contents, { title: '2장' }, 'content');
        // One exercise with one file in each place; returns the exercise id and its S3 key.
        const exerciseWithFile = async (contentId: number) => {
          const id = await post(
            `${contents}/${contentId}/exercises`,
            { body: `문제 ${contentId}` },
            'exercise',
          );
          const before = new Set(objects.keys());
          const { status } = await call(`/api/exercises/${id}/files`, {
            method: 'POST',
            form: form(pdf, 'problem', 'a.pdf'),
            headers: app,
          });
          assert.equal(status, 201);
          const key = [...objects.keys()].find((k) => !before.has(k));
          assert.ok(key);
          return { id, key };
        };
        const inChapter = await exerciseWithFile(chapter);
        const inSection = await exerciseWithFile(section);
        const inOther = await exerciseWithFile(other);
        const lone = await exerciseWithFile(other);
        const rows = async () =>
          Number(
            (
              await pool.query(
                `SELECT count(*) AS n FROM exercise_files f JOIN exercises e ON e.id = f.exercise_id
                 WHERE e.textbook_id = $1`,
                [book],
              )
            ).rows[0].n,
          );

        // S3 refuses to remove: the delete still stands (the rows are committed first, #265), no
        // row points at a missing file, and the key that stayed behind is logged for a sweep.
        failing.remove = true;
        const logged: string[] = [];
        const original = console.error;
        console.error = (line: string) => void logged.push(line);
        try {
          assert.equal((await call(`/api/exercises/${lone.id}`, { method: 'DELETE' })).status, 204);
        } finally {
          console.error = original;
          failing.remove = false;
        }
        assert.equal((await call(`/api/exercises/${lone.id}`)).status, 404);
        assert.equal(await rows(), 3);
        assert.equal(objects.has(lone.key), true);
        const orphaned = logged
          .map((line) => JSON.parse(line))
          .find((l) => l.event === 'orphaned_files');
        assert.deepEqual(orphaned?.keys, [lone.key]);
        objects.delete(lone.key); // the later sweep
        assert.equal(objects.size, 3);
        assert.equal((await call(`${contents}`)).status, 200);

        // A chapter takes its sections' files with it, and no other chapter's.
        assert.equal((await call(`${contents}/${chapter}`, { method: 'DELETE' })).status, 204);
        assert.deepEqual([...objects.keys()], [inOther.key]);
        assert.equal(objects.has(inSection.key) || objects.has(inChapter.key), false);

        // A textbook a study log points to cannot be deleted: its files stay.
        const log = await call('/api/study-logs', {
          method: 'POST',
          body: { studyDate: '2026-11-15', startTime: '09:00', endTime: '10:00', textbookId: book },
        });
        assert.equal(log.status, 201);
        const blocked = await call(`/api/textbooks/${book}`, { method: 'DELETE' });
        assert.equal(blocked.status, 409);
        assert.deepEqual([...objects.keys()], [inOther.key]);
        assert.equal(await rows(), 1);

        // Without the log, the textbook and its last file go.
        await pool.query('DELETE FROM study_logs WHERE textbook_id = $1', [book]);
        assert.equal((await call(`/api/textbooks/${book}`, { method: 'DELETE' })).status, 204);
        assert.equal(objects.size, 0);
        assert.equal(await rows(), 0);
      },
      { fileStorage: storage },
    );
  },
);

test(
  'reading the keys for a delete holds back uploads to those exercises (#209)',
  { skip: !url },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    const prefix = '[통합테스트 파일 잠금]';
    const cleanup = () => pool.query('DELETE FROM textbooks WHERE title LIKE $1', [`${prefix}%`]);
    await cleanup();
    const deleting = await pool.connect();
    const uploading = await pool.connect();
    t.after(async () => {
      await deleting.query('ROLLBACK').catch(() => undefined);
      deleting.release();
      uploading.release();
      await cleanup();
      await pool.end();
    });
    const book = (
      await pool.query<{ id: number }>('INSERT INTO textbooks (title) VALUES ($1) RETURNING id', [
        `${prefix} 선형대수`,
      ])
    ).rows[0].id;
    const content = (
      await pool.query<{ id: number }>(
        `INSERT INTO textbook_contents (textbook_id, title, position) VALUES ($1, '1장', 1)
         RETURNING id`,
        [book],
      )
    ).rows[0].id;
    const exercise = (
      await pool.query<{ id: number }>(
        `INSERT INTO exercises (textbook_id, content_id, body) VALUES ($1, $2, '문제') RETURNING id`,
        [book, content],
      )
    ).rows[0].id;

    for (const owner of [
      { exerciseId: exercise },
      { textbookId: book, contentId: content },
      { textbookId: book },
    ]) {
      await deleting.query('BEGIN');
      assert.deepEqual(await storedKeys(deleting, owner), []);
      // An upload's row needs the exercise; it must wait for the delete instead of slipping in.
      await uploading.query("SET lock_timeout = '200ms'");
      await assert.rejects(
        uploading.query(
          `INSERT INTO exercise_files
             (exercise_id, role, storage_key, original_name, content_type, size_bytes)
           VALUES ($1, 'problem', $2, 'a.pdf', 'application/pdf', 1)`,
          [exercise, `exercises/${exercise}/lock-test.pdf`],
        ),
        (error: { code?: string }) => error.code === '55P03',
        JSON.stringify(owner),
      );
      await deleting.query('ROLLBACK');
    }
  },
);
