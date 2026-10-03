import {
  ErrorCode,
  IMAGE_MAX_BYTES,
  mediaKindOf,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  type MediaKind,
  type MediaPurpose,
  type MediaStatus,
} from '@rt/contracts';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import { err, ok, type Result } from '../../../platform/result.js';
import {
  rejectionReason,
  type ModerationLabel,
  type RejectionCategory,
  type ScanDecision,
} from './scan-decision.js';

export const MediaEvents = {
  Uploaded: 'media.MediaUploaded',
  Ready: 'media.MediaReady',
  Held: 'media.MediaHeldForReview',
  Rejected: 'media.MediaRejected',
  Failed: 'media.MediaFailed',
  Deleted: 'media.MediaDeleted',
  /** The video provider finished transcoding; thumbnails can be scanned. */
  VideoTranscoded: 'media.VideoTranscoded',
} as const;

export const MediaErrors = {
  notFound: () => domainError(ErrorCode.NotFound, 'This file does not exist or is not available.'),
  tooLarge: (kind: MediaKind) =>
    domainError(
      ErrorCode.MediaTooLarge,
      kind === 'video' ? 'Videos can be up to 300 MB.' : 'Images can be up to 15 MB.',
    ),
  videoNotAllowed: () =>
    domainError(ErrorCode.MediaTypeNotAllowed, 'Profile pictures must be photos.'),
  videoUnavailable: () =>
    domainError(ErrorCode.MediaTypeNotAllowed, 'Video uploads are not available yet.'),
  notUploaded: () =>
    domainError(
      ErrorCode.MediaNotUploaded,
      'The upload has not finished. Upload the file, then try again.',
    ),
  mismatch: () =>
    domainError(
      ErrorCode.MediaUploadMismatch,
      'The uploaded file does not match what was requested. Start a new upload.',
    ),
  wrongState: (status: MediaStatus) =>
    domainError(
      ErrorCode.MediaWrongState,
      `This upload is already ${status.replaceAll('_', ' ')}.`,
    ),
};

export const IMAGE_SIZES = { small: 256, medium: 1024, large: 2048 } as const;

export const VIDEO_TOO_LONG_REASON = `Videos can be up to ${String(VIDEO_MAX_SECONDS)} seconds. Trim it and upload again.`;

export interface MediaAssetProps {
  readonly id: string;
  readonly ownerId: string;
  readonly purpose: MediaPurpose;
  readonly status: MediaStatus;
  readonly contentType: string;
  readonly declaredBytes: number;
  readonly actualBytes: number | null;
  readonly moderationLabels: readonly ModerationLabel[];
  readonly rejectionReason: string | null;
  readonly failureReason: string | null;
  readonly readyAt: Date | null;
  /** Video only: the provider's direct upload, its asset and the playback id. */
  readonly providerUploadId: string | null;
  readonly providerAssetId: string | null;
  readonly playbackId: string | null;
  readonly durationSeconds: number | null;
  /** Set when a moderator decided on held media. */
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * One uploaded file and where it is in the pipeline. Only a ready asset may be
 * shown to anyone except its owner (design section 10).
 */
export class MediaAsset {
  private pendingEvents: DomainEvent[] = [];

  private constructor(private props: MediaAssetProps) {}

  static requestUpload(input: {
    id: string;
    ownerId: string;
    purpose: MediaPurpose;
    contentType: string;
    bytes: number;
    now: Date;
  }): Result<MediaAsset, DomainError> {
    const kind = mediaKindOf(input.contentType);
    if (kind === 'video' && input.purpose !== 'portfolio')
      return err(MediaErrors.videoNotAllowed());
    if (input.bytes > (kind === 'video' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES))
      return err(MediaErrors.tooLarge(kind));
    return ok(
      new MediaAsset({
        id: input.id,
        ownerId: input.ownerId,
        purpose: input.purpose,
        status: 'awaiting_upload',
        contentType: input.contentType,
        declaredBytes: input.bytes,
        actualBytes: null,
        moderationLabels: [],
        rejectionReason: null,
        failureReason: null,
        readyAt: null,
        providerUploadId: null,
        providerAssetId: null,
        playbackId: null,
        durationSeconds: null,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: input.now,
        updatedAt: input.now,
      }),
    );
  }

  static restore(props: MediaAssetProps): MediaAsset {
    return new MediaAsset(props);
  }

  get id(): string {
    return this.props.id;
  }
  get ownerId(): string {
    return this.props.ownerId;
  }
  get status(): MediaStatus {
    return this.props.status;
  }
  get purpose(): MediaPurpose {
    return this.props.purpose;
  }
  get kind(): MediaKind {
    return mediaKindOf(this.props.contentType);
  }

  /** The original lands here. The bucket's lifecycle rule deletes anything left under pending/ after a day. */
  get originalKey(): string {
    return `pending/${this.props.ownerId}/${this.props.id}`;
  }

  variantKey(size: keyof typeof IMAGE_SIZES): string {
    return `media/${this.props.ownerId}/${this.props.id}/${String(IMAGE_SIZES[size])}.webp`;
  }

  snapshot(): MediaAssetProps {
    return { ...this.props };
  }

  /** The stored object must be what the intent allowed: same type, no larger than declared. */
  confirmUpload(
    stored: { bytes: number; contentType: string },
    now: Date,
  ): Result<void, DomainError> {
    if (this.props.status !== 'awaiting_upload')
      return err(MediaErrors.wrongState(this.props.status));
    if (stored.bytes > this.props.declaredBytes || stored.contentType !== this.props.contentType) {
      this.fail('The uploaded file did not match the upload request.', now);
      return err(MediaErrors.mismatch());
    }
    this.props = { ...this.props, status: 'processing', actualBytes: stored.bytes, updatedAt: now };
    this.raise(MediaEvents.Uploaded, now);
    return ok(undefined);
  }

  /** Video: the direct upload the phone sends the file to. Set once, before anyone sees the intent. */
  attachProviderUpload(uploadId: string): void {
    this.props = { ...this.props, providerUploadId: uploadId };
  }

  /**
   * Video: the provider has the whole file. Reached from the phone's complete call or
   * the provider's webhook, whichever comes first; the second is a no-op.
   */
  confirmVideoUpload(providerAssetId: string, now: Date): Result<void, DomainError> {
    if (this.kind !== 'video') return err(MediaErrors.mismatch());
    if (this.props.status !== 'awaiting_upload') return ok(undefined);
    this.props = { ...this.props, status: 'processing', providerAssetId, updatedAt: now };
    this.raise(MediaEvents.Uploaded, now);
    return ok(undefined);
  }

  /** Video: transcoded. Too-long clips are refused here; the rest go on to be scanned. */
  videoTranscoded(
    input: { providerAssetId: string; playbackId: string; durationSeconds: number },
    now: Date,
  ): void {
    if (this.kind !== 'video') return;
    if (this.props.status === 'awaiting_upload')
      this.confirmVideoUpload(input.providerAssetId, now);
    if (this.props.status !== 'processing') return;
    this.props = {
      ...this.props,
      providerAssetId: input.providerAssetId,
      playbackId: input.playbackId,
      durationSeconds: input.durationSeconds,
      updatedAt: now,
    };
    if (input.durationSeconds > VIDEO_MAX_SECONDS) {
      this.props = { ...this.props, status: 'rejected', rejectionReason: VIDEO_TOO_LONG_REASON };
      this.raise(MediaEvents.Rejected, now);
      return;
    }
    this.props = { ...this.props, status: 'scanning' };
    this.raise(MediaEvents.VideoTranscoded, now);
  }

  /**
   * A moderator's decision on held media. Approval raises Ready, exactly like a clean scan,
   * so whatever waits for the file (an avatar completing a profile) carries on.
   */
  review(
    decision: { approve: true } | { approve: false; category: RejectionCategory },
    reviewerId: string,
    now: Date,
  ): Result<void, DomainError> {
    if (this.props.status !== 'held_for_review')
      return err(MediaErrors.wrongState(this.props.status));
    const reviewed = { reviewedBy: reviewerId, reviewedAt: now, updatedAt: now };
    if (decision.approve) {
      this.props = { ...this.props, ...reviewed, status: 'ready', readyAt: now };
      this.raise(MediaEvents.Ready, now);
    } else {
      this.props = {
        ...this.props,
        ...reviewed,
        status: 'rejected',
        rejectionReason: rejectionReason(decision.category, this.kind),
      };
      this.raise(MediaEvents.Rejected, now);
    }
    return ok(undefined);
  }

  /** Nobody finished the upload in time. */
  abandon(now: Date): void {
    if (this.props.status !== 'awaiting_upload') return;
    this.fail('The upload was not finished.', now);
  }

  markProcessed(now: Date): void {
    if (this.props.status !== 'processing') return;
    this.props = { ...this.props, status: 'scanning', updatedAt: now };
  }

  applyScan(decision: ScanDecision, now: Date): void {
    if (this.props.status !== 'scanning') return;
    if (decision.outcome === 'ready') {
      this.props = { ...this.props, status: 'ready', readyAt: now, updatedAt: now };
      this.raise(MediaEvents.Ready, now);
    } else if (decision.outcome === 'held') {
      this.props = {
        ...this.props,
        status: 'held_for_review',
        moderationLabels: decision.labels,
        updatedAt: now,
      };
      this.raise(MediaEvents.Held, now);
    } else {
      this.props = {
        ...this.props,
        status: 'rejected',
        moderationLabels: decision.labels,
        rejectionReason: rejectionReason(decision.category, this.kind),
        updatedAt: now,
      };
      this.raise(MediaEvents.Rejected, now);
    }
  }

  fail(reason: string, now: Date): void {
    if (['ready', 'rejected', 'deleted'].includes(this.props.status)) return;
    this.props = { ...this.props, status: 'failed', failureReason: reason, updatedAt: now };
    this.raise(MediaEvents.Failed, now);
  }

  /** The owner no longer wants it. The worker removes the stored files once this commits. */
  discard(now: Date): void {
    if (this.props.status === 'deleted') return;
    this.props = { ...this.props, status: 'deleted', updatedAt: now };
    this.raise(MediaEvents.Deleted, now);
  }

  /** Every object this asset can have in our storage. Video lives with the provider instead. */
  get storedKeys(): string[] {
    if (this.kind === 'video') return [];
    return [
      this.originalKey,
      ...(Object.keys(IMAGE_SIZES) as (keyof typeof IMAGE_SIZES)[]).map((size) =>
        this.variantKey(size),
      ),
    ];
  }

  pullEvents(): DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  private raise(type: string, occurredAt: Date): void {
    this.pendingEvents.push({
      type,
      aggregateId: this.props.id,
      occurredAt,
      payload: { ownerId: this.props.ownerId, purpose: this.props.purpose, kind: this.kind },
    });
  }
}

export interface MediaAssetRepository {
  findById(id: string, options?: { lock?: boolean }): Promise<MediaAsset | null>;
  findByIds(ids: readonly string[]): Promise<MediaAsset[]>;
  findByOwner(ownerId: string): Promise<MediaAsset[]>;
  /** Held media, oldest first, after the given position in that order. */
  findHeld(after: { heldAt: Date; id: string } | null, limit: number): Promise<MediaAsset[]>;
  /** Intents older than the cutoff that never got a file, oldest first. */
  findAbandoned(createdBefore: Date, limit: number): Promise<MediaAsset[]>;
  save(asset: MediaAsset): Promise<void>;
}
