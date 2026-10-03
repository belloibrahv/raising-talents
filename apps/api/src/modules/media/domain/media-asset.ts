import { ErrorCode, IMAGE_MAX_BYTES, type MediaPurpose, type MediaStatus } from '@rt/contracts';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import { err, ok, type Result } from '../../../platform/result.js';
import { REJECTION_REASON, type ModerationLabel, type ScanDecision } from './scan-decision.js';

export const MediaEvents = {
  Uploaded: 'media.MediaUploaded',
  Ready: 'media.MediaReady',
  Held: 'media.MediaHeldForReview',
  Rejected: 'media.MediaRejected',
  Failed: 'media.MediaFailed',
  Deleted: 'media.MediaDeleted',
} as const;

export const MediaErrors = {
  notFound: () => domainError(ErrorCode.NotFound, 'This file does not exist or is not available.'),
  tooLarge: () => domainError(ErrorCode.MediaTooLarge, 'Images can be up to 15 MB.'),
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
    if (input.bytes > IMAGE_MAX_BYTES) return err(MediaErrors.tooLarge());
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
        rejectionReason: REJECTION_REASON[decision.category],
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

  /** Every object this asset can have in storage, whatever state it reached. */
  get storedKeys(): string[] {
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
      payload: { ownerId: this.props.ownerId, purpose: this.props.purpose },
    });
  }
}

export interface MediaAssetRepository {
  findById(id: string, options?: { lock?: boolean }): Promise<MediaAsset | null>;
  findByIds(ids: readonly string[]): Promise<MediaAsset[]>;
  save(asset: MediaAsset): Promise<void>;
}
