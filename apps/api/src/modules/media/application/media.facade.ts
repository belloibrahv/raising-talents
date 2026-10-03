import type { ImageUrls, MediaKind, MediaPurpose, MediaStatus, VideoPlayback } from '@rt/contracts';
import type { Logger } from 'pino';
import type { Clock } from '../../../platform/clock.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import type { MediaAssetRepository } from '../domain/media-asset.js';
import type { MediaPresenter } from './media-presenter.js';
import type { ObjectStorage, VideoProvider } from './ports.js';

/** What another module may know about an asset. */
export interface MediaSummary {
  readonly id: string;
  readonly ownerId: string;
  readonly purpose: MediaPurpose;
  readonly kind: MediaKind;
  readonly status: MediaStatus;
  readonly rejectionReason: string | null;
  /** True once a moderator decided on it (it had been held). */
  readonly reviewed: boolean;
  /** Set only when a ready image. */
  readonly urls: ImageUrls | null;
  /** Set only when a ready video. */
  readonly video: VideoPlayback | null;
}

/** How other modules read and release media. They never touch media tables or storage. */
export class MediaFacade {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly presenter: MediaPresenter,
    private readonly clock: Clock,
    private readonly storage: ObjectStorage,
    private readonly video: VideoProvider,
  ) {}

  async describe(ids: readonly string[]): Promise<Map<string, MediaSummary>> {
    const found = await this.assets.findByIds(ids);
    const summaries = await Promise.all(
      found.map(async (asset): Promise<MediaSummary> => {
        const props = asset.snapshot();
        return {
          id: props.id,
          ownerId: props.ownerId,
          purpose: props.purpose,
          kind: asset.kind,
          status: props.status,
          rejectionReason: props.rejectionReason,
          reviewed: props.reviewedAt !== null,
          ...(await this.presenter.links(asset)),
        };
      }),
    );
    return new Map(summaries.map((summary) => [summary.id, summary]));
  }

  /** Every file the person uploaded, for their data export. */
  async listForOwner(ownerId: string): Promise<MediaSummary[]> {
    const assets = await this.assets.findByOwner(ownerId);
    return [...(await this.describe(assets.map((asset) => asset.id))).values()];
  }

  /**
   * Removes every stored copy of the person's files, at us and at the video provider,
   * before their account is erased (the rows then go with the account).
   */
  async purgeOwnerFiles(ownerId: string): Promise<number> {
    const assets = await this.assets.findByOwner(ownerId);
    for (const asset of assets) {
      const keys = asset.storedKeys;
      if (keys.length > 0) await this.storage.remove(keys);
      const { providerAssetId, providerUploadId } = asset.snapshot();
      if (asset.kind === 'video' && this.video.enabled) {
        if (providerAssetId) await this.video.deleteAsset(providerAssetId);
        else if (providerUploadId) await this.video.cancelUpload(providerUploadId);
      }
    }
    return assets.length;
  }

  /**
   * Marks the owner's asset deleted inside the caller's transaction. The files go
   * once the transaction commits and the worker sees MediaDeleted.
   */
  async discard(mediaId: string, ownerId: string): Promise<void> {
    const asset = await this.assets.findById(mediaId, { lock: true });
    if (asset?.ownerId !== ownerId) return;
    asset.discard(this.clock.now());
    await this.assets.save(asset);
  }
}

/**
 * Runs in the worker for MediaDeleted and MediaRejected: a file nobody may see is not kept.
 * The scanner already removes the images it rejects; doing it again is harmless.
 */
export class RemoveDeletedMediaHandler {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly storage: ObjectStorage,
    private readonly video: VideoProvider,
    private readonly logger: Logger,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const asset = await this.assets.findById(event.aggregateId);
    if (asset?.status !== 'deleted' && asset?.status !== 'rejected') return;
    const keys = asset.storedKeys;
    if (keys.length > 0) await this.storage.remove(keys);
    const { providerAssetId, providerUploadId } = asset.snapshot();
    if (asset.kind === 'video' && this.video.enabled) {
      if (providerAssetId) await this.video.deleteAsset(providerAssetId);
      else if (providerUploadId) await this.video.cancelUpload(providerUploadId);
    }
    this.logger.info({ mediaId: asset.id, status: asset.status }, 'media files removed');
  }
}
