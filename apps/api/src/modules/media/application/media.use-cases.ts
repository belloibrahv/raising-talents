import {
  mediaKindOf,
  UPLOAD_INTENT_TTL_SECONDS,
  type MediaAsset as MediaAssetView,
  type MediaPurpose,
  type UploadIntentResponse,
} from '@rt/contracts';
import type { Logger } from 'pino';
import type { Clock } from '../../../platform/clock.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import { newId } from '../../../platform/ids.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import type { ProfileAccounts } from '../../talent-profiles/application/ports.js';
import { MediaAsset, MediaErrors, type MediaAssetRepository } from '../domain/media-asset.js';
import { decideScan, type ModerationLabel, type ScanPolicy } from '../domain/scan-decision.js';
import type { MediaPresenter } from './media-presenter.js';
import {
  InvalidImageError,
  type ContentScanner,
  type ImageProcessor,
  type ObjectStorage,
  type VideoProvider,
  type VideoProviderEvent,
} from './ports.js';

export const MEDIA = {
  Repository: Symbol('MediaAssetRepository'),
  Storage: Symbol('ObjectStorage'),
  Processor: Symbol('ImageProcessor'),
  Scanner: Symbol('ContentScanner'),
  ScanPolicy: Symbol('ScanPolicy'),
  Urls: Symbol('MediaUrls'),
  Video: Symbol('VideoProvider'),
  Signer: Symbol('PlaybackSigner'),
  Presenter: Symbol('MediaPresenter'),
  ScanVideo: Symbol('ScanVideoHandler'),
  VideoEvents: Symbol('HandleVideoProviderEventHandler'),
  WebhookVerifier: Symbol('VideoWebhookVerifier'),
  AbandonedUploads: Symbol('AbandonedUploadsJob'),
  CreateIntent: Symbol('CreateUploadIntentHandler'),
  Complete: Symbol('CompleteUploadHandler'),
  Get: Symbol('GetMediaQuery'),
  Process: Symbol('ProcessImageHandler'),
  Facade: Symbol('MediaFacade'),
  RemoveDeleted: Symbol('RemoveDeletedMediaHandler'),
  EventHandlers: Symbol('MediaEventHandlers'),
} as const;

/** Which roles may upload for which purpose. Agents gain avatars with their own profile screens. */
const PURPOSE_ROLES: Record<MediaPurpose, readonly string[]> = {
  avatar: ['talent'],
  portfolio: ['talent'],
};

export const UPLOAD_INTENT_LIMIT = { perUser: 30, windowSeconds: 3600 } as const;

export class CreateUploadIntentHandler {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly storage: ObjectStorage,
    private readonly video: VideoProvider,
    private readonly accounts: ProfileAccounts,
    private readonly rateLimiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    userId: string;
    purpose: MediaPurpose;
    contentType: string;
    bytes: number;
  }): Promise<Result<UploadIntentResponse, DomainError>> {
    const account = await this.accounts.profileContext(input.userId);
    if (account && !account.emailVerified)
      return err(domainError('EMAIL_NOT_VERIFIED', 'Verify your email before uploading.'));
    if (!account?.role || !PURPOSE_ROLES[input.purpose].includes(account.role)) {
      return err(domainError('WRONG_ROLE', 'Your account cannot upload this kind of file.'));
    }
    if (mediaKindOf(input.contentType) === 'video' && !this.video.enabled)
      return err(MediaErrors.videoUnavailable());
    const limit = await this.rateLimiter.consume(
      `upload-intent:${input.userId}`,
      UPLOAD_INTENT_LIMIT.perUser,
      UPLOAD_INTENT_LIMIT.windowSeconds,
    );
    if (!limit.allowed)
      return err(
        domainError('RATE_LIMITED', 'Too many uploads. Try again later.', limit.retryAfterSeconds),
      );

    const now = this.clock.now();
    const requested = MediaAsset.requestUpload({
      id: newId(),
      ownerId: input.userId,
      purpose: input.purpose,
      contentType: input.contentType,
      bytes: input.bytes,
      now,
    });
    if (!requested.ok) return requested;
    const asset = requested.value;

    let upload: UploadIntentResponse['upload'];
    if (asset.kind === 'video') {
      // The phone sends video straight to the provider; the asset id comes back in its webhooks.
      const created = await this.video.createUpload({ passthrough: asset.id });
      asset.attachProviderUpload(created.uploadId);
      upload = { method: 'PUT', url: created.url, fields: {} };
    } else {
      const presigned = await this.storage.presignUpload({
        key: asset.originalKey,
        contentType: input.contentType,
        maxBytes: input.bytes,
        expiresInSeconds: UPLOAD_INTENT_TTL_SECONDS,
      });
      upload = { method: 'POST', ...presigned };
    }
    await this.assets.save(asset);
    return ok({
      mediaId: asset.id,
      upload,
      expiresAt: new Date(now.getTime() + UPLOAD_INTENT_TTL_SECONDS * 1000).toISOString(),
    });
  }
}

export class CompleteUploadHandler {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly storage: ObjectStorage,
    private readonly video: VideoProvider,
    private readonly presenter: MediaPresenter,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    userId: string;
    mediaId: string;
  }): Promise<Result<MediaAssetView, DomainError>> {
    const asset = await this.assets.findById(input.mediaId);
    if (asset?.ownerId !== input.userId) return err(MediaErrors.notFound());
    // A retry after a lost response: report where it is instead of failing.
    if (asset.status !== 'awaiting_upload') return ok(await this.presenter.view(asset));
    if (asset.kind === 'video') return this.completeVideo(asset);

    const stored = await this.storage.describe(asset.originalKey);
    if (!stored) return err(MediaErrors.notUploaded());

    const confirmed = asset.confirmUpload(stored, this.clock.now());
    // A mismatched upload is marked failed and saved, so it cannot be completed later.
    await this.uow.run(async () => {
      await this.assets.save(asset);
    });
    if (!confirmed.ok) {
      await this.storage.remove([asset.originalKey]);
      return confirmed;
    }
    return ok(await this.presenter.view(asset));
  }

  /** The provider's webhook may confirm first; asking here keeps the app from waiting on it. */
  private async completeVideo(asset: MediaAsset): Promise<Result<MediaAssetView, DomainError>> {
    const uploadId = asset.snapshot().providerUploadId;
    if (!uploadId) return err(MediaErrors.notUploaded());
    const upload = await this.video.uploadStatus(uploadId);
    if (upload.status === 'waiting') return err(MediaErrors.notUploaded());
    if (upload.status !== 'asset_created' || !upload.assetId) {
      asset.fail('The video upload did not reach the provider.', this.clock.now());
      await this.uow.run(() => this.assets.save(asset));
      return err(MediaErrors.mismatch());
    }
    const assetId = upload.assetId;
    const saved = await this.uow.run(async () => {
      const current = await this.assets.findById(asset.id, { lock: true });
      if (!current) return err(MediaErrors.notFound());
      const confirmed = current.confirmVideoUpload(assetId, this.clock.now());
      if (!confirmed.ok) return confirmed;
      await this.assets.save(current);
      return ok(current);
    });
    if (!saved.ok) return saved;
    return ok(await this.presenter.view(saved.value));
  }
}

export class GetMediaQuery {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly presenter: MediaPresenter,
  ) {}

  /** Owners see every state. Everyone else sees ready assets only; anything else is a 404. */
  async execute(input: {
    viewerId: string;
    mediaId: string;
  }): Promise<Result<MediaAssetView, DomainError>> {
    const asset = await this.assets.findById(input.mediaId);
    if (!asset) return err(MediaErrors.notFound());
    if (asset.ownerId !== input.viewerId && asset.status !== 'ready')
      return err(MediaErrors.notFound());
    const view = await this.presenter.view(asset);
    return ok(asset.ownerId === input.viewerId ? view : { ...view, rejectionReason: null });
  }
}

/**
 * Runs in the worker for every MediaUploaded event. Safe to run again: it picks up
 * from the asset's status, and writing a variant twice writes the same bytes.
 */
export class ProcessImageHandler {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly storage: ObjectStorage,
    private readonly processor: ImageProcessor,
    private readonly scanner: ContentScanner,
    private readonly policy: ScanPolicy,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const asset = await this.assets.findById(event.aggregateId);
    if (!asset || (asset.status !== 'processing' && asset.status !== 'scanning')) return;
    if (asset.kind !== 'image') return;

    const original = await this.storage.read(asset.originalKey);
    let variants;
    try {
      variants = await this.processor.process(original);
    } catch (error) {
      if (!(error instanceof InvalidImageError)) throw error;
      asset.fail('The file is not a readable image.', this.clock.now());
      await this.uow.run(() => this.assets.save(asset));
      await this.storage.remove([asset.originalKey]);
      return;
    }

    for (const variant of variants) {
      await this.storage.write(asset.variantKey(variant.size), variant.body, 'image/webp');
    }
    asset.markProcessed(this.clock.now());

    // The medium variant is metadata-free and well under the scanner's 5 MB limit.
    const medium = variants.find((variant) => variant.size === 'medium') ?? variants[0];
    if (!medium) throw new Error('Image processor returned no variants');
    const decision = decideScan(await this.scanner.scanImage(medium.body), this.policy);
    asset.applyScan(decision, this.clock.now());

    // The owner may have deleted it while we worked. Saving our stale copy would bring it back.
    const discarded = await this.uow.run(async () => {
      const current = await this.assets.findById(asset.id, { lock: true });
      if (current?.status === 'deleted') return true;
      await this.assets.save(asset);
      return false;
    });
    if (discarded) {
      await this.storage.remove(asset.storedKeys);
      this.logger.info({ mediaId: asset.id }, 'media deleted during processing');
      return;
    }
    // The original may carry location data the phone failed to strip; it is not kept once processed.
    await this.storage.remove([asset.originalKey]);
    if (decision.outcome === 'rejected') {
      await this.storage.remove(
        (['small', 'medium', 'large'] as const).map((size) => asset.variantKey(size)),
      );
    }
    this.logger.info({ mediaId: asset.id, outcome: decision.outcome }, 'media scanned');
  }
}

/** Frames are scanned one at a time, and the clip is judged on every label from every frame. */
export class ScanVideoHandler {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly video: VideoProvider,
    private readonly scanner: ContentScanner,
    private readonly policy: ScanPolicy,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const asset = await this.assets.findById(event.aggregateId);
    if (asset?.kind !== 'video' || asset.status !== 'scanning') return;
    const { playbackId, durationSeconds } = asset.snapshot();
    if (!playbackId) throw new Error(`Video ${asset.id} is scanning without a playback id`);

    const labels: ModerationLabel[] = [];
    for (const frame of await this.video.thumbnails(playbackId, durationSeconds ?? 0)) {
      labels.push(...(await this.scanner.scanImage(frame)));
    }
    const decision = decideScan(labels, this.policy);

    const saved = await this.uow.run(async () => {
      const current = await this.assets.findById(asset.id, { lock: true });
      if (current?.status !== 'scanning') return null;
      current.applyScan(decision, this.clock.now());
      await this.assets.save(current);
      return current;
    });
    if (!saved) return;
    this.logger.info({ mediaId: asset.id, outcome: decision.outcome }, 'video scanned');
  }
}

/**
 * Runs in the api process for each verified webhook. Providers retry and may send
 * events twice or out of order; each transition ignores events it has moved past.
 */
export class HandleVideoProviderEventHandler {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly video: VideoProvider,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(event: VideoProviderEvent): Promise<void> {
    const orphan = await this.uow.run(async () => {
      const asset = await this.assets.findById(event.mediaId, { lock: true });
      if (asset?.kind !== 'video') {
        this.logger.warn(
          { mediaId: event.mediaId, type: event.type },
          'video event for unknown media',
        );
        return null;
      }
      // Closed or deleted before the provider caught up: nothing will ever show this
      // file, so it is deleted at the provider instead of being billed forever.
      if ((asset.status === 'failed' || asset.status === 'deleted') && 'assetId' in event)
        return event.assetId;
      const now = this.clock.now();
      if (event.type === 'upload_asset_created') asset.confirmVideoUpload(event.assetId, now);
      if (event.type === 'asset_ready')
        asset.videoTranscoded(
          {
            providerAssetId: event.assetId,
            playbackId: event.playbackId,
            durationSeconds: event.durationSeconds,
          },
          now,
        );
      if (event.type === 'asset_errored') asset.fail(event.reason, now);
      await this.assets.save(asset);
      return null;
    });
    if (orphan) {
      await this.video.deleteAsset(orphan);
      this.logger.info({ mediaId: event.mediaId }, 'late video deleted at the provider');
    }
  }
}

export const ABANDONED_AFTER_SECONDS = 3600;
const ABANDONED_BATCH = 100;

/**
 * Scheduled in the worker. An intent lasts ten minutes; an hour later nothing can
 * finish it, so the row is closed and anything half sent is removed.
 */
export class AbandonedUploadsJob {
  readonly name = 'media.abandoned-uploads';
  readonly everySeconds = 900;

  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly storage: ObjectStorage,
    private readonly video: VideoProvider,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async run(): Promise<void> {
    const cutoff = new Date(this.clock.now().getTime() - ABANDONED_AFTER_SECONDS * 1000);
    const candidates = await this.assets.findAbandoned(cutoff, ABANDONED_BATCH);
    let closed = 0;
    for (const candidate of candidates) {
      const abandoned = await this.uow.run(async () => {
        const asset = await this.assets.findById(candidate.id, { lock: true });
        // complete may have run since the query; only an untouched intent is closed.
        if (asset?.status !== 'awaiting_upload') return null;
        asset.abandon(this.clock.now());
        await this.assets.save(asset);
        return asset;
      });
      if (!abandoned) continue;
      closed += 1;
      const uploadId = abandoned.snapshot().providerUploadId;
      try {
        if (abandoned.kind === 'video' && uploadId && this.video.enabled)
          await this.video.cancelUpload(uploadId);
        else await this.storage.remove([abandoned.originalKey]);
      } catch (error) {
        // The row is closed either way; the bucket lifecycle rule and the provider's own
        // upload timeout remove what is left, so one failure must not stop the batch.
        this.logger.warn({ err: error, mediaId: abandoned.id }, 'abandoned upload cleanup failed');
      }
    }
    if (closed > 0) this.logger.info({ closed }, 'abandoned uploads closed');
  }
}
