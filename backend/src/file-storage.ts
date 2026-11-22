import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

// Where the original files of exercises and answers are kept (#28): S3, as the user decided. The
// routes take a `FileStorage`, so tests hand in an in-memory stand-in and never call AWS.
export type FileStorage = {
  put: (key: string, body: Buffer, contentType: string) => Promise<void>;
  // The stored file as a stream, so a download never holds the whole file in memory (#266).
  get: (key: string) => Promise<Readable>;
  remove: (key: string) => Promise<void>;
  // The stored objects under a prefix with their age, for the sweep of leftovers (#335). Optional so
  // a stand-in that never sweeps does not have to write it.
  list?: (prefix: string) => Promise<{ key: string; lastModified: Date }[]>;
};

// A storage call that failed: the status and message the API answers with.
export class FileStorageError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type S3Settings = { bucket?: string; region?: string };

// Logs the SDK failure before it is mapped, so a 502 can be traced: the error name, its message, and
// the AWS request ID. The line carries no bucket, key, or credentials (the SDK messages do not
// include them), and the object key is never passed in.
function logStorageFailure(error: unknown) {
  const metadata = (
    error as { $metadata?: { requestId?: unknown; httpStatusCode?: unknown } } | null
  )?.$metadata;
  console.error(
    JSON.stringify({
      time: new Date().toISOString(),
      level: 'error',
      event: 'file_storage_failed',
      error_name: error instanceof Error ? error.name : typeof error,
      error_message: error instanceof Error ? error.message : String(error),
      aws_request_id: typeof metadata?.requestId === 'string' ? metadata.requestId : null,
      http_status: typeof metadata?.httpStatusCode === 'number' ? metadata.httpStatusCode : null,
    }),
  );
}

// Turns SDK failures into what the person can act on. The SDK names its errors; the classes are
// spread over several packages, so the name is what is compared.
function explain(error: unknown): never {
  if (error instanceof FileStorageError) throw error;
  logStorageFailure(error);
  const name = error instanceof Error ? error.name : '';
  if (name === 'NoSuchKey' || name === 'NotFound')
    throw new FileStorageError(404, 'The stored file is missing');
  if (name === 'CredentialsProviderError')
    throw new FileStorageError(503, 'AWS credentials for file storage are not set on the server');
  if (
    name === 'AccessDenied' ||
    name === 'InvalidAccessKeyId' ||
    name === 'SignatureDoesNotMatch' ||
    name === 'ExpiredToken'
  )
    throw new FileStorageError(503, 'File storage refused the server credentials');
  if (name === 'NoSuchBucket')
    throw new FileStorageError(503, 'The file storage bucket (FILE_BUCKET) does not exist');
  throw new FileStorageError(502, 'File storage error');
}

// S3 through the official SDK. The bucket and region come from FILE_BUCKET and AWS_REGION, and
// credentials from the SDK's default chain (.env locally, the IAM role on the server). The client is
// made on first use, so the server starts (and the rest of the app works) without them; until they
// are set, only file requests fail.
export function s3Storage(
  settings: S3Settings = { bucket: process.env.FILE_BUCKET, region: process.env.AWS_REGION },
  client?: Pick<S3Client, 'send'>,
): FileStorage {
  let s3 = client;
  const connect = () => {
    const bucket = settings.bucket?.trim();
    const region = settings.region?.trim();
    if (!bucket || !region)
      throw new FileStorageError(
        503,
        'File storage is not set up. Set FILE_BUCKET and AWS_REGION on the server',
      );
    s3 ??= new S3Client({ region });
    return { s3, bucket };
  };
  return {
    put: async (key, body, contentType) => {
      const { s3, bucket } = connect();
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
          }),
        );
      } catch (error) {
        explain(error);
      }
    },
    get: async (key) => {
      const { s3, bucket } = connect();
      try {
        const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!object.Body) throw new FileStorageError(404, 'The stored file is missing');
        if (!(object.Body instanceof Readable))
          throw new FileStorageError(502, 'File storage error');
        return object.Body;
      } catch (error) {
        explain(error);
      }
    },
    remove: async (key) => {
      const { s3, bucket } = connect();
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (error) {
        explain(error);
      }
    },
    list: async (prefix) => {
      const { s3, bucket } = connect();
      const found: { key: string; lastModified: Date }[] = [];
      try {
        let token: string | undefined;
        do {
          const page = await s3.send(
            new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
          );
          for (const object of page.Contents ?? [])
            if (object.Key && object.LastModified)
              found.push({ key: object.Key, lastModified: object.LastModified });
          token = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (token);
      } catch (error) {
        explain(error);
      }
      return found;
    },
  };
}
