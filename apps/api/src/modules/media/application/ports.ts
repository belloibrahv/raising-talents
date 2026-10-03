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

export type ProviderUploadStatus =
  'waiting' | 'asset_created' | 'errored' | 'cancelled' | 'timed_out';

/** Transcoding, storage and streaming for video (ADR-007). Mux in every real environment. */
export interface VideoProvider {
  readonly enabled: boolean;
  /** A one-off upload URL the phone PUTs the file to. passthrough comes back in every webhook. */
  createUpload(input: { passthrough: string }): Promise<{ uploadId: string; url: string }>;
  uploadStatus(uploadId: string): Promise<{ status: ProviderUploadStatus; assetId: string | null }>;
  /** Frames from across the clip, as JPEGs small enough for the content scanner. */
  thumbnails(playbackId: string, durationSeconds: number): Promise<readonly Buffer[]>;
  deleteAsset(assetId: string): Promise<void>;
  cancelUpload(uploadId: string): Promise<void>;
}

/** Short-lived signed links, so a copied URL stops working. */
export interface PlaybackSigner {
  sign(
    playbackId: string,
    durationSeconds: number,
  ): Promise<{
    streamUrl: string;
    posterUrl: string;
    durationSeconds: number;
    expiresAt: string;
  }>;
}

/** What the provider tells us, already verified and stripped of its own vocabulary. */
export type VideoProviderEvent =
  | { readonly type: 'upload_asset_created'; readonly mediaId: string; readonly assetId: string }
  | {
      readonly type: 'asset_ready';
      readonly mediaId: string;
      readonly assetId: string;
      readonly playbackId: string;
      readonly durationSeconds: number;
    }
  | { readonly type: 'asset_errored'; readonly mediaId: string; readonly reason: string };

/** Proves a webhook came from the provider, then reads it. Implemented per provider. */
export interface VideoWebhookVerifier {
  verify(rawBody: Buffer, signatureHeader: string | undefined): boolean;
  parse(body: unknown): VideoProviderEvent | null;
}
