import type { PlaybackSigner, ProviderUploadStatus, VideoProvider } from '../application/ports.js';

/** Records what was asked of the provider and lets a test script its answers. */
export class FakeVideoProvider implements VideoProvider, PlaybackSigner {
  readonly enabled = true;
  readonly uploads = new Map<
    string,
    { passthrough: string; status: ProviderUploadStatus; assetId: string | null }
  >();
  readonly deletedAssets: string[] = [];
  readonly cancelledUploads: string[] = [];
  frames = 3;
  private nextId = 1;

  async createUpload(input: { passthrough: string }) {
    const uploadId = `upload-${String(this.nextId++)}`;
    this.uploads.set(uploadId, {
      passthrough: input.passthrough,
      status: 'waiting',
      assetId: null,
    });
    return { uploadId, url: `https://storage.video.test/${uploadId}` };
  }

  /** What happens when the phone finishes sending the file. Returns the provider's asset id. */
  receiveFile(uploadId: string): string {
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new Error(`No upload ${uploadId}`);
    const assetId = `asset-for-${uploadId}`;
    this.uploads.set(uploadId, { ...upload, status: 'asset_created', assetId });
    return assetId;
  }

  async uploadStatus(uploadId: string) {
    const upload = this.uploads.get(uploadId);
    return { status: upload?.status ?? 'errored', assetId: upload?.assetId ?? null };
  }

  async thumbnails(): Promise<readonly Buffer[]> {
    return Array.from({ length: this.frames }, (_, index) => Buffer.from(`frame-${String(index)}`));
  }

  async deleteAsset(assetId: string): Promise<void> {
    this.deletedAssets.push(assetId);
  }

  async cancelUpload(uploadId: string): Promise<void> {
    this.cancelledUploads.push(uploadId);
  }

  async sign(playbackId: string, durationSeconds: number) {
    return {
      streamUrl: `https://stream.video.test/${playbackId}.m3u8?token=signed`,
      posterUrl: `https://image.video.test/${playbackId}/thumbnail.webp?token=signed`,
      durationSeconds,
      expiresAt: '2026-10-01T15:00:00.000Z',
    };
  }
}
