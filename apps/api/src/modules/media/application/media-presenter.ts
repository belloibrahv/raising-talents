import type { ImageUrls, MediaAsset as MediaAssetView, VideoPlayback } from '@rt/contracts';
import type { MediaAsset } from '../domain/media-asset.js';
import type { MediaUrls } from './media-urls.js';
import type { PlaybackSigner } from './ports.js';

/** Where a ready asset can be seen. Nothing for any other state. */
export interface MediaLinks {
  readonly urls: ImageUrls | null;
  readonly video: VideoPlayback | null;
}

export class MediaPresenter {
  constructor(
    private readonly urls: MediaUrls,
    private readonly signer: PlaybackSigner,
  ) {}

  async links(asset: MediaAsset): Promise<MediaLinks> {
    const props = asset.snapshot();
    if (props.status !== 'ready') return { urls: null, video: null };
    if (asset.kind === 'image')
      return { urls: this.urls.forImage(props.ownerId, props.id), video: null };
    if (!props.playbackId) return { urls: null, video: null };
    return {
      urls: null,
      video: await this.signer.sign(props.playbackId, props.durationSeconds ?? 0),
    };
  }

  /** For moderators only: the processed file whatever its status. Never the original upload. */
  async preview(asset: MediaAsset): Promise<MediaLinks> {
    const props = asset.snapshot();
    if (asset.kind === 'image')
      return { urls: this.urls.forPreview(props.ownerId, props.id), video: null };
    if (!props.playbackId) return { urls: null, video: null };
    return {
      urls: null,
      video: await this.signer.sign(props.playbackId, props.durationSeconds ?? 0),
    };
  }

  async view(asset: MediaAsset): Promise<MediaAssetView> {
    const props = asset.snapshot();
    return {
      id: props.id,
      purpose: props.purpose,
      kind: asset.kind,
      status: props.status,
      ...(await this.links(asset)),
      rejectionReason: props.rejectionReason,
      createdAt: props.createdAt.toISOString(),
    };
  }
}
