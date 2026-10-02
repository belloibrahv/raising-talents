import {
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
import { decideScan, type ScanPolicy } from '../domain/scan-decision.js';
import type { MediaUrls } from './media-urls.js';
import {
  InvalidImageError,
  type ContentScanner,
  type ImageProcessor,
  type ObjectStorage,
} from './ports.js';

export const MEDIA = {
  Repository: Symbol('MediaAssetRepository'),
  Storage: Symbol('ObjectStorage'),
  Processor: Symbol('ImageProcessor'),
  Scanner: Symbol('ContentScanner'),
  ScanPolicy: Symbol('ScanPolicy'),
  Urls: Symbol('MediaUrls'),
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

export function toMediaView(asset: MediaAsset, urls: MediaUrls): MediaAssetView {
  const props = asset.snapshot();
  return {
    id: props.id,
    purpose: props.purpose,
    status: props.status,
    urls: props.status === 'ready' ? urls.forImage(props.ownerId, props.id) : null,
    rejectionReason: props.rejectionReason,
    createdAt: props.createdAt.toISOString(),
  };
}

export class CreateUploadIntentHandler {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly storage: ObjectStorage,
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

    const upload = await this.storage.presignUpload({
      key: asset.originalKey,
      contentType: input.contentType,
      maxBytes: input.bytes,
      expiresInSeconds: UPLOAD_INTENT_TTL_SECONDS,
    });
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
    private readonly urls: MediaUrls,
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
    if (asset.status !== 'awaiting_upload') return ok(toMediaView(asset, this.urls));

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
    return ok(toMediaView(asset, this.urls));
  }
}

export class GetMediaQuery {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly urls: MediaUrls,
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
    const view = toMediaView(asset, this.urls);
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

    await this.uow.run(() => this.assets.save(asset));
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
