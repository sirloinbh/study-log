import { randomUUID } from 'node:crypto';

import { type Request, type Response, Router } from 'express';
import multer from 'multer';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { type FileStorage, FileStorageError } from './file-storage.js';

// The files a delete of an exercise, a chapter (with its sections) or a textbook takes with it
// (#209). Read before the delete, which cascades the rows away.
export type FileOwner = { exerciseId: number } | { textbookId: number; contentId?: number };

export async function storedKeys(db: Pick<PoolClient, 'query'>, owner: FileOwner) {
  const { rows } = await db.query<{ key: string }>(
    'exerciseId' in owner
      ? 'SELECT storage_key AS key FROM exercise_files WHERE exercise_id = $1'
      : owner.contentId === undefined
        ? `SELECT f.storage_key AS key FROM exercise_files f
           JOIN exercises e ON e.id = f.exercise_id WHERE e.textbook_id = $1`
        : `WITH RECURSIVE tree AS (
             SELECT id FROM textbook_contents WHERE textbook_id = $1 AND id = $2
             UNION ALL
             SELECT c.id FROM textbook_contents c JOIN tree t ON c.textbook_id = $1 AND c.parent_id = t.id
           )
           SELECT f.storage_key AS key FROM exercise_files f
           JOIN exercises e ON e.id = f.exercise_id
           WHERE e.textbook_id = $1 AND e.content_id IN (SELECT id FROM tree)`,
    'exerciseId' in owner
      ? [owner.exerciseId]
      : owner.contentId === undefined
        ? [owner.textbookId]
        : [owner.textbookId, owner.contentId],
  );
  return rows.map((row) => row.key);
}

// Removes those stored copies (#209). The caller runs it inside the delete's transaction, after the
// delete itself succeeded, and rolls back when this returns a failure: the delete is then refused
// and can be repeated, and no copy is ever left in S3 without its row (the user's choice). Copies
// removed before a failure stay removed; their rows answer 404 for the content until the retry.
export async function removeStored(storage: FileStorage, keys: string[]) {
  const results = await Promise.allSettled(keys.map((key) => storage.remove(key)));
  const failed = results.find((result) => result.status === 'rejected');
  if (!failed) return undefined;
  if (!(failed.reason instanceof FileStorageError)) throw failed.reason;
  return { status: failed.reason.status, body: { error: failed.reason.message } };
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

const pathId = (label: string) =>
  z
    .string()
    .regex(/^[1-9]\d{0,14}$/, `Invalid ${label} ID`)
    .transform(Number);
const exerciseIdParam = pathId('exercise');
const fileIdParam = pathId('file');

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
// one too, not a server fault.
async function receive(req: Request, res: Response) {
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
export function exerciseFileRoutes(pool: Pool, storage: FileStorage) {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const id = exerciseIdParam.parse((req.params as Record<string, string>).id);
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
    const id = exerciseIdParam.parse((req.params as Record<string, string>).id);
    // Before reading the body, so a request for an exercise that does not exist never holds up to
    // 20 MB in memory. The insert below still catches one deleted in the meantime.
    const exercise = await pool.query('SELECT 1 FROM exercises WHERE id = $1', [id]);
    if (!exercise.rowCount) return void res.status(404).json(notFound);
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

    const key = `exercises/${id}/${randomUUID()}.${format.extension}`;
    try {
      await storage.put(key, file.buffer, format.type);
    } catch (error) {
      return void storageFailed(error, res);
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO exercise_files
           (exercise_id, role, storage_key, original_name, content_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${columns}`,
        [id, role, key, name, format.type, file.size],
      );
      res.status(201).json({ file: rows[0] });
    } catch (error) {
      // No row points at the stored copy now, so it goes; if that fails too, the copy is left over
      // in the bucket, which costs storage but breaks nothing.
      await storage.remove(key).catch(() => undefined);
      // The exercise was deleted while the file was being stored.
      if ((error as { code?: string }).code !== '23503') throw error;
      res.status(404).json(notFound);
    }
  });

  return router;
}

// Reading and deleting one stored file: /api/exercise-files/:fileId(/content)
export function fileRoutes(pool: Pool, storage: FileStorage) {
  const router = Router();

  router.get('/:fileId', async (req, res) => {
    const fileId = fileIdParam.parse(req.params.fileId);
    const { rows } = await pool.query(`SELECT ${columns} FROM exercise_files WHERE id = $1`, [
      fileId,
    ]);
    if (rows.length === 0) return void res.status(404).json(fileNotFound);
    res.json({ file: rows[0] });
  });

  // The file itself, shown in the browser (a PDF in its viewer, a photo as an image).
  router.get('/:fileId/content', async (req, res) => {
    const fileId = fileIdParam.parse(req.params.fileId);
    const { rows } = await pool.query<{ key: string; name: string; type: string }>(
      `SELECT storage_key AS key, original_name AS name, content_type AS type
       FROM exercise_files WHERE id = $1`,
      [fileId],
    );
    if (rows.length === 0) return void res.status(404).json(fileNotFound);
    const { key, name, type } = rows[0];
    let body;
    try {
      body = await storage.get(key);
    } catch (error) {
      return void storageFailed(error, res);
    }
    res.set({
      'content-type': type,
      'content-disposition': `inline; filename*=UTF-8''${encodeName(name)}`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-cache',
    });
    res.send(body);
  });

  // Removes the stored copy first: if that fails, nothing changes and the request can be repeated.
  // Removing a copy that is already gone succeeds in S3.
  router.delete('/:fileId', async (req, res) => {
    const fileId = fileIdParam.parse(req.params.fileId);
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
    await pool.query('DELETE FROM exercise_files WHERE id = $1', [fileId]);
    res.status(204).end();
  });

  return router;
}
