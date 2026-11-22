import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

import { type Request, type Response, Router } from 'express';
import multer from 'multer';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { auditChange } from './audit-log.js';
import { type FileStorage, FileStorageError } from './file-storage.js';
import { inTransaction } from './sql.js';
import { parseId } from './standard/http.js';

// The files a delete of an exercise, a chapter (with its sections) or a textbook takes with it
// (#209). Read before the delete, which cascades the rows away.
export type FileOwner = { exerciseId: number } | { textbookId: number; contentId?: number };

export async function storedKeys(db: Pick<PoolClient, 'query'>, owner: FileOwner) {
  // The exercises are locked first. An upload to one of them needs its row, so it waits, and fails
  // as a missing exercise once the delete commits, instead of slipping in a file after the keys
  // were read whose copy nobody would remove.
  const { rows: exercises } = await db.query<{ id: number }>(
    'exerciseId' in owner
      ? 'SELECT id FROM exercises WHERE id = $1 FOR UPDATE'
      : owner.contentId === undefined
        ? 'SELECT id FROM exercises WHERE textbook_id = $1 FOR UPDATE'
        : `WITH RECURSIVE tree AS (
             SELECT id FROM textbook_contents WHERE textbook_id = $1 AND id = $2
             UNION ALL
             SELECT c.id FROM textbook_contents c JOIN tree t ON c.textbook_id = $1 AND c.parent_id = t.id
           )
           SELECT e.id FROM exercises e
           WHERE e.textbook_id = $1 AND e.content_id IN (SELECT id FROM tree) FOR UPDATE OF e`,
    'exerciseId' in owner
      ? [owner.exerciseId]
      : owner.contentId === undefined
        ? [owner.textbookId]
        : [owner.textbookId, owner.contentId],
  );
  if (exercises.length === 0) return [];
  const { rows } = await db.query<{ key: string }>(
    'SELECT storage_key AS key FROM exercise_files WHERE exercise_id = ANY($1::bigint[])',
    [exercises.map((exercise) => exercise.id)],
  );
  return rows.map((row) => row.key);
}

// At most this many S3 calls at once, so a textbook with many files does not fire them all together.
const removeBatch = 10;

// Removes the stored copies of rows that were already deleted (#209, #265). The caller runs it
// after the delete's transaction committed, so a failure here can never bring a row back or leave a
// row pointing at a file that is gone: the delete stands, and every copy that S3 would not remove
// is logged by key (`orphaned_files`) for a later sweep. It tries every key, never throws, and
// returns the keys it could not remove.
export async function removeStoredFiles(storage: FileStorage, keys: string[]) {
  const failed: string[] = [];
  let reason: unknown;
  for (let start = 0; start < keys.length; start += removeBatch) {
    const batch = keys.slice(start, start + removeBatch);
    const results = await Promise.allSettled(batch.map((key) => storage.remove(key)));
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') return;
      failed.push(batch[i]);
      reason ??= result.reason;
    });
  }
  if (failed.length > 0)
    console.error(
      JSON.stringify({
        time: new Date().toISOString(),
        level: 'error',
        event: 'orphaned_files',
        count: failed.length,
        keys: failed,
        error_name: reason instanceof Error ? reason.name : typeof reason,
      }),
    );
  return failed;
}

// What one exercise may keep (#266): a few dozen photos and PDFs, not an archive.
export const maxFilesPerExercise = 20;
export const maxBytesPerExercise = 100 * 1024 * 1024;

// How many uploads may be in flight at once (#266). An upload holds up to 20 MiB in memory until
// it is stored, so a burst of them must be turned away instead of exhausting the container.
export const maxConcurrentUploads = 4;

// A counter that hands out a fixed number of slots without waiting: `enter` says no when none is
// free, and the caller answers 503 so the person can try again.
export function createGate(slots: number) {
  let used = 0;
  return {
    enter() {
      if (used >= slots) return false;
      used += 1;
      return true;
    },
    leave() {
      used -= 1;
    },
  };
}

// Original files of exercises and answers (#28): PDFs and photos, kept in S3 with a row each in
// exercise_files. Same bound as the table.
export const maxFileBytes = 20 * 1024 * 1024;

// The formats allowed and how each one starts. The type is read from the bytes, never from the name
// or the type the browser sent, so a file that only claims to be a PDF is refused.
const formats = [
  { type: 'application/pdf', extension: 'pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { type: 'image/jpeg', extension: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { type: 'image/png', extension: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
] as const;

export const detectFormat = (bytes: Buffer) =>
  formats.find(({ magic }) => magic.every((byte, i) => bytes[i] === byte));

const roleInput = z.enum(['problem', 'answer'], {
  error: (issue) =>
    issue.input === undefined
      ? 'Choose whether the file shows the problem or the answer'
      : 'The file role must be problem or answer',
});

// The name as the person saw it, kept only for showing and downloading. Control characters go, and
// so do the direction overrides that could make "exe.pdf" read as something else; an empty name
// becomes "file". It is never used as a storage path.
// eslint-disable-next-line no-control-regex
const hiddenCharacters = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export function displayName(raw: string) {
  const name = raw.replace(hiddenCharacters, '').trim();
  return name.length === 0 ? 'file' : name;
}

// RFC 5987 value for `filename*`: encodeURIComponent leaves ' ( ) * as they are, which it does not
// allow.
export const encodeName = (name: string) =>
  encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const columns = `id, exercise_id AS "exerciseId", role, original_name AS name,
  content_type AS "contentType", size_bytes AS size,
  to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') AS "createdAt"`;

const notFound = { error: 'Exercise not found' };
const tooManyFiles = { error: `An exercise can hold at most ${maxFilesPerExercise} files` };
const tooManyBytes = {
  error: `The files of one exercise must total at most ${maxBytesPerExercise / 1024 / 1024} MB`,
};

// How many files an exercise holds and how many bytes they take.
async function usage(db: Pick<Pool, 'query'>, exerciseId: number) {
  const { rows } = await db.query<{ files: number; bytes: number }>(
    `SELECT count(*)::int AS files, COALESCE(sum(size_bytes), 0)::float8 AS bytes
     FROM exercise_files WHERE exercise_id = $1`,
    [exerciseId],
  );
  return rows[0];
}
const fileNotFound = { error: 'File not found' };

// One file per request, in the form field `file`, with `role` beside it. Held in memory: the files
// are small enough (20 MiB at most) and go straight on to S3.
// Browsers send the file name as raw UTF-8; multer would otherwise read it as latin1 and garble
// Korean names.
const upload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8',
  limits: { fileSize: maxFileBytes, files: 1, fields: 4, parts: 5 },
}).single('file');

// Runs multer and turns what it refuses into a client error; a body that is not valid multipart is
// one too, not a server fault. Extraction (#30) reads its file the same way.
export async function receive(req: Request, res: Response) {
  try {
    await new Promise<void>((resolve, reject) =>
      upload(req, res, (error: unknown) => (error ? reject(error) : resolve())),
    );
    return true;
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE')
      res.status(413).json({ error: 'The file must be at most 20 MB' });
    // A second file, or a file under another field name.
    else if (
      error instanceof multer.MulterError &&
      (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE')
    )
      res.status(400).json({ error: 'Send one file in the file field' });
    else res.status(400).json({ error: 'Could not read the uploaded file' });
    return false;
  }
}

// Answers a storage failure with its status; anything else is a server fault.
const storageFailed = (error: unknown, res: Response) => {
  if (!(error instanceof FileStorageError)) throw error;
  res.status(error.status).json({ error: error.message });
};

// Uploading and listing the files of one exercise: /api/exercises/:id/files
export function exerciseFileRoutes(
  pool: Pool,
  storage: FileStorage,
  uploadSlots = maxConcurrentUploads,
) {
  const router = Router({ mergeParams: true });
  const uploads = createGate(uploadSlots);

  router.get('/', async (req, res) => {
    const id = parseId((req.params as Record<string, string>).id, 'exercise');
    const exercise = await pool.query('SELECT 1 FROM exercises WHERE id = $1', [id]);
    if (!exercise.rowCount) return void res.status(404).json(notFound);
    const { rows } = await pool.query(
      `SELECT ${columns} FROM exercise_files WHERE exercise_id = $1 ORDER BY id`,
      [id],
    );
    res.json({ files: rows });
  });

  router.post('/', async (req, res) => {
    // A form on another site can post multipart without a CORS preflight, but cannot add this
    // header; the app's own requests always do, so only they can store files.
    if (req.get('x-requested-with') !== 'study-log')
      return void res.status(403).json({ error: 'Upload files from the study log app' });
    if (!req.is('multipart/form-data'))
      return void res.status(415).json({ error: 'Send the file as multipart/form-data' });
    const id = parseId((req.params as Record<string, string>).id, 'exercise');
    // Before reading the body, so a request for an exercise that does not exist, or one that is
    // already full, never holds up to 20 MB in memory. The insert below checks again under a lock.
    const exercise = await pool.query('SELECT 1 FROM exercises WHERE id = $1', [id]);
    if (!exercise.rowCount) return void res.status(404).json(notFound);
    const before = await usage(pool, id);
    if (before.files >= maxFilesPerExercise) return void res.status(409).json(tooManyFiles);
    // A burst of uploads must not exhaust memory: past the slots, ask the person to retry.
    if (!uploads.enter()) {
      res.set('retry-after', '5');
      return void res.status(503).json({ error: 'Too many uploads at once. Try again shortly' });
    }
    try {
      if (!(await receive(req, res))) return;
      const role = roleInput.parse((req.body as Record<string, unknown> | undefined)?.role);
      const file = req.file;
      if (!file || file.size === 0) return void res.status(400).json({ error: 'Choose a file' });
      const format = detectFormat(file.buffer);
      if (!format)
        return void res.status(415).json({ error: 'Only PDF, JPEG and PNG files can be uploaded' });
      const name = displayName(file.originalname);
      if (name.length > 255)
        return void res.status(400).json({ error: 'The file name must be at most 255 characters' });
      if (before.bytes + file.size > maxBytesPerExercise)
        return void res.status(413).json(tooManyBytes);

      const key = `exercises/${id}/${randomUUID()}.${format.extension}`;
      try {
        await storage.put(key, file.buffer, format.type);
      } catch (error) {
        return void storageFailed(error, res);
      }
      try {
        const reply = await inTransaction<{ status: number; body: unknown }>(
          pool,
          async (client) => {
            // The same lock a delete takes, so two uploads cannot both pass the limits.
            const locked = await client.query('SELECT 1 FROM exercises WHERE id = $1 FOR UPDATE', [
              id,
            ]);
            // The exercise was deleted while the file was being stored.
            if (!locked.rowCount) return { status: 404, body: notFound };
            const now = await usage(client, id);
            if (now.files >= maxFilesPerExercise) return { status: 409, body: tooManyFiles };
            if (now.bytes + file.size > maxBytesPerExercise)
              return { status: 413, body: tooManyBytes };
            const { rows } = await client.query(
              `INSERT INTO exercise_files
                 (exercise_id, role, storage_key, original_name, content_type, size_bytes)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${columns}`,
              [id, role, key, name, format.type, file.size],
            );
            await auditChange(req, res, client, 'create', 'exercise_file', rows[0].id, {
              exerciseId: id,
              role,
              name,
            });
            return { status: 201, body: { file: rows[0] } };
          },
          (reply) => reply.status < 400,
        );
        // No row points at the stored copy when refused, so it goes; if that fails too, the copy is
        // left over in the bucket, which costs storage but breaks nothing.
        if (reply.status >= 400) await storage.remove(key).catch(() => undefined);
        res.status(reply.status).json(reply.body);
      } catch (error) {
        await storage.remove(key).catch(() => undefined);
        throw error;
      }
    } finally {
      uploads.leave();
    }
  });

  return router;
}

// Reading and deleting one stored file: /api/exercise-files/:fileId(/content)
export function fileRoutes(pool: Pool, storage: FileStorage) {
  const router = Router();

  router.get('/:fileId', async (req, res) => {
    const fileId = parseId(req.params.fileId, 'file');
    const { rows } = await pool.query(`SELECT ${columns} FROM exercise_files WHERE id = $1`, [
      fileId,
    ]);
    if (rows.length === 0) return void res.status(404).json(fileNotFound);
    res.json({ file: rows[0] });
  });

  // The file itself, shown in the browser (a PDF in its viewer, a photo as an image). It is streamed
  // from S3, never held whole in memory (#266). `sandbox` stops a PDF or an image served from the
  // app's own origin from running scripts or reading the app's data if a browser opens it as a page.
  router.get('/:fileId/content', async (req, res) => {
    const fileId = parseId(req.params.fileId, 'file');
    const { rows } = await pool.query<{ key: string; name: string; type: string; size: number }>(
      `SELECT storage_key AS key, original_name AS name, content_type AS type, size_bytes::float8 AS size
       FROM exercise_files WHERE id = $1`,
      [fileId],
    );
    if (rows.length === 0) return void res.status(404).json(fileNotFound);
    const { key, name, type, size } = rows[0];
    let body;
    try {
      body = await storage.get(key);
    } catch (error) {
      return void storageFailed(error, res);
    }
    res.set({
      'content-type': type,
      'content-length': String(size),
      'content-disposition': `inline; filename*=UTF-8''${encodeName(name)}`,
      'content-security-policy': 'sandbox',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-cache',
    });
    // Once the headers are out a failure cannot become a status; cut the connection instead.
    await pipeline(body, res).catch((error: unknown) => {
      // A person who closes the tab mid-download is not a fault; pipeline already freed the S3 body.
      if ((error as { code?: string } | null)?.code === 'ERR_STREAM_PREMATURE_CLOSE')
        return void res.destroy();
      console.error(
        JSON.stringify({
          time: new Date().toISOString(),
          level: 'error',
          event: 'file_stream_failed',
          error_name: error instanceof Error ? error.name : typeof error,
        }),
      );
      res.destroy();
    });
  });

  // Removes the stored copy first: if that fails, nothing changes and the request can be repeated.
  // Removing a copy that is already gone succeeds in S3.
  router.delete('/:fileId', async (req, res) => {
    const fileId = parseId(req.params.fileId, 'file');
    const { rows } = await pool.query<{ key: string }>(
      'SELECT storage_key AS key FROM exercise_files WHERE id = $1',
      [fileId],
    );
    if (rows.length === 0) return void res.status(404).json(fileNotFound);
    try {
      await storage.remove(rows[0].key);
    } catch (error) {
      return void storageFailed(error, res);
    }
    await inTransaction(pool, async (client) => {
      const removed = await client.query('DELETE FROM exercise_files WHERE id = $1', [fileId]);
      if (removed.rowCount)
        await auditChange(req, res, client, 'delete', 'exercise_file', fileId, {});
    });
    res.status(204).end();
  });

  return router;
}
