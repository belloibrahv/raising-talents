import type { ImageUrls, MediaPurpose, MediaStatus } from '@rt/contracts';
import type { Logger } from 'pino';
import type { Clock } from '../../../platform/clock.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import type { MediaAssetRepository } from '../domain/media-asset.js';
import type { MediaUrls } from './media-urls.js';
import type { ObjectStorage } from './ports.js';

/** What another module may know about an asset. */
export interface MediaSummary {
  readonly id: string;
  readonly ownerId: string;
  readonly purpose: MediaPurpose;
  readonly status: MediaStatus;
  readonly rejectionReason: string | null;
  /** Set only when the asset is ready. */
  readonly urls: ImageUrls | null;
}

/** How other modules read and release media. They never touch media tables or storage. */
export class MediaFacade {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly urls: MediaUrls,
    private readonly clock: Clock,
  ) {}

  async describe(ids: readonly string[]): Promise<Map<string, MediaSummary>> {
    const found = await this.assets.findByIds(ids);
    return new Map(
      found.map((asset) => {
        const props = asset.snapshot();
        return [
          props.id,
          {
            id: props.id,
            ownerId: props.ownerId,
            purpose: props.purpose,
            status: props.status,
            rejectionReason: props.rejectionReason,
            urls: props.status === 'ready' ? this.urls.forImage(props.ownerId, props.id) : null,
          },
        ];
      }),
    );
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

/** Runs in the worker for every MediaDeleted event. Removing a missing object is not an error. */
export class RemoveDeletedMediaHandler {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly storage: ObjectStorage,
    private readonly logger: Logger,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const asset = await this.assets.findById(event.aggregateId);
    if (asset?.status !== 'deleted') return;
    await this.storage.remove(asset.storedKeys);
    this.logger.info({ mediaId: asset.id }, 'media files removed');
  }
}
