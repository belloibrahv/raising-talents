export interface PresignedUpload {
  readonly url: string;
  readonly fields: Record<string, string>;
}

/** Where files live. S3 in every environment; a compatible local server in development. */
export interface ObjectStorage {
  /** A browser-style POST locked to one key, one content type and a size range. */
  presignUpload(input: {
    key: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload>;
  /** Size and type of a stored object, or null if nothing is there. */
  describe(key: string): Promise<{ bytes: number; contentType: string } | null>;
  read(key: string): Promise<Buffer>;
  write(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(keys: readonly string[]): Promise<void>;
}

export class InvalidImageError extends Error {}

export interface ImageVariant {
  readonly size: 'small' | 'medium' | 'large';
  readonly body: Buffer;
}

/** Decodes, strips all metadata and re-encodes as WebP at each size. Throws InvalidImageError for non-images. */
export interface ImageProcessor {
  process(original: Buffer): Promise<readonly ImageVariant[]>;
}

export interface ContentScanner {
  scanImage(
    image: Buffer,
  ): Promise<readonly { name: string; parentName: string | null; confidence: number }[]>;
}
