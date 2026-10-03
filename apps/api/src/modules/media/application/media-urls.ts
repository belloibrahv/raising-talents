import type { ImageUrls } from '@rt/contracts';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { IMAGE_SIZES } from '../domain/media-asset.js';

/** Signs moderators' preview links when the API serves media (ADR-036). */
export interface PreviewSigning {
  readonly key: Buffer;
  readonly now: () => Date;
}

const HOUR_SECONDS = 3600;

/** Public addresses of a ready image's variants. Keys are deterministic, so no lookup is needed. */
export class MediaUrls {
  constructor(
    private readonly cdnBaseUrl: string,
    private readonly signing: PreviewSigning | null = null,
  ) {}

  forImage(ownerId: string, mediaId: string): ImageUrls {
    const base = `${this.cdnBaseUrl.replace(/\/$/, '')}/media/${ownerId}/${mediaId}`;
    return {
      small: `${base}/${String(IMAGE_SIZES.small)}.webp`,
      medium: `${base}/${String(IMAGE_SIZES.medium)}.webp`,
      large: `${base}/${String(IMAGE_SIZES.large)}.webp`,
    };
  }

  /**
   * For moderators: links to an image that is not public yet. When the API serves media they
   * carry a signature valid for one to two hours (rounded, so the queue's links stay the same
   * within an hour); behind a CDN they are the plain addresses, as before.
   */
  forPreview(ownerId: string, mediaId: string): ImageUrls {
    const urls = this.forImage(ownerId, mediaId);
    if (!this.signing) return urls;
    const now = Math.floor(this.signing.now().getTime() / 1000);
    const expires = (Math.floor(now / HOUR_SECONDS) + 2) * HOUR_SECONDS;
    const query = `?expires=${String(expires)}&signature=${this.signature(ownerId, mediaId, expires)}`;
    return { small: urls.small + query, medium: urls.medium + query, large: urls.large + query };
  }

  /** Whether a preview link's signature is genuine and still valid. */
  verifyPreview(
    ownerId: string,
    mediaId: string,
    expires: string | undefined,
    signature: string | undefined,
  ): boolean {
    if (!this.signing || !expires || !signature || !/^\d{1,12}$/.test(expires)) return false;
    if (Number(expires) * 1000 < this.signing.now().getTime()) return false;
    const expected = Buffer.from(this.signature(ownerId, mediaId, Number(expires)));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private signature(ownerId: string, mediaId: string, expires: number): string {
    if (!this.signing) return '';
    return createHmac('sha256', this.signing.key)
      .update(`${ownerId}/${mediaId}:${String(expires)}`)
      .digest('base64url');
  }
}
