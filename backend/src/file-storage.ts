import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

// Where the original files of exercises and answers are kept (#28): S3, as the user decided. The
// routes take a `FileStorage`, so tests hand in an in-memory stand-in and never call AWS.
export type FileStorage = {
  put: (key: string, body: Buffer, contentType: string) => Promise<void>;
  get: (key: string) => Promise<Buffer>;
  remove: (key: string) => Promise<void>;
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

// Turns SDK failures into what the person can act on. The SDK names its errors; the classes are
// spread over several packages, so the name is what is compared.
function explain(error: unknown): never {
  if (error instanceof FileStorageError) throw error;
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
        return Buffer.from(await object.Body.transformToByteArray());
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
  };
}
