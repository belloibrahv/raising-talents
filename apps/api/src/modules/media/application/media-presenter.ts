import type {
  AudioPlayback,
  ImageUrls,
  MediaAsset as MediaAssetView,
  VideoPlayback,
} from '@rt/contracts';
import type { MediaAsset } from '../domain/media-asset.js';
import type { MediaUrls } from './media-urls.js';
import type { PlaybackSigner } from './ports.js';

/** Where a ready asset can be seen. Nothing for any other state. */
export interface MediaLinks {
  readonly urls: ImageUrls | null;
  readonly video: VideoPlayback | null;
  readonly audio: AudioPlayback | null;
}

const NOTHING: MediaLinks = { urls: null, video: null, audio: null };
/** A stored file's address does not expire. */
const NEVER_EXPIRES = '9999-12-31T23:59:59.000Z';

export class MediaPresenter {
  constructor(
    private readonly urls: MediaUrls,
    private readonly signer: PlaybackSigner,
  ) {}

  async links(asset: MediaAsset): Promise<MediaLinks> {
    const props = asset.snapshot();
    if (props.status !== 'ready') return NOTHING;
    if (asset.kind === 'image')
      return { ...NOTHING, urls: this.urls.forImage(props.ownerId, props.id) };
    if (asset.kind === 'audio') {
      return {
        ...NOTHING,
        audio: {
          url: this.urls.forFile(props.ownerId, props.id, 'audio'),
          contentType: props.contentType,
        },
      };
    }
    if (asset.servedAsFile) {
      const url = this.urls.forFile(props.ownerId, props.id, 'video');
      return {
        ...NOTHING,
        video: {
          format: 'file',
          streamUrl: url,
          // There is no still picture of a stored video; players show its first frame.
          posterUrl: url,
          durationSeconds: props.durationSeconds ?? 0,
          expiresAt: NEVER_EXPIRES,
        },
      };
    }
    if (!props.playbackId) return NOTHING;
    return { ...NOTHING, video: await this.stream(props.playbackId, props.durationSeconds) };
  }

  private async stream(playbackId: string, durationSeconds: number | null): Promise<VideoPlayback> {
    return { format: 'hls', ...(await this.signer.sign(playbackId, durationSeconds ?? 0)) };
  }

  /** For moderators only: the processed file whatever its status. Never the original upload. */
  async preview(asset: MediaAsset): Promise<MediaLinks> {
    const props = asset.snapshot();
    if (asset.kind === 'image')
      return { ...NOTHING, urls: this.urls.forPreview(props.ownerId, props.id) };
    // A recording or stored video is never held, so there is nothing to preview before it is live.
    if (asset.servedAsFile) return this.links(asset);
    if (!props.playbackId) return NOTHING;
    return { ...NOTHING, video: await this.stream(props.playbackId, props.durationSeconds) };
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
