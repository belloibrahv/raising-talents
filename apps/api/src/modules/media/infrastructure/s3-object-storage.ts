import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { ObjectStorage, PresignedUpload } from '../application/ports.js';

/**
 * S3, or any S3-compatible server in development. Uploads use presigned POST because,
 * unlike a presigned PUT, its policy can enforce a size limit: S3 itself refuses a
 * file larger than the intent allowed.
 */
export class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async presignUpload(input: {
    key: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload> {
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: input.key,
      Expires: input.expiresInSeconds,
      Fields: { 'Content-Type': input.contentType },
      Conditions: [
        ['eq', '$key', input.key],
        ['eq', '$Content-Type', input.contentType],
        ['content-length-range', 1, input.maxBytes],
      ],
    });
    return { url, fields };
  }

  async describe(key: string): Promise<{ bytes: number; contentType: string } | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { bytes: head.ContentLength ?? 0, contentType: head.ContentType ?? '' };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 404 || (error as { name?: string }).name === 'NotFound') return null;
      throw error;
    }
  }

  async read(key: string): Promise<Buffer> {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!object.Body) throw new Error(`Empty object at ${key}`);
    return Buffer.from(await object.Body.transformToByteArray());
  }

  async write(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Variants never change: a new upload gets a new key, so CDN and phones may cache for a year.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  async remove(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((key) => ({ Key: key })), Quiet: true },
      }),
    );
  }
}
