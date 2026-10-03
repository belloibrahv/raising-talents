import type { ImageUrls } from '@rt/contracts';
import { IMAGE_SIZES } from '../domain/media-asset.js';

/** Public addresses of a ready image's variants. Keys are deterministic, so no lookup is needed. */
export class MediaUrls {
  constructor(private readonly cdnBaseUrl: string) {}

  forImage(ownerId: string, mediaId: string): ImageUrls {
    const base = `${this.cdnBaseUrl.replace(/\/$/, '')}/media/${ownerId}/${mediaId}`;
    return {
      small: `${base}/${String(IMAGE_SIZES.small)}.webp`,
      medium: `${base}/${String(IMAGE_SIZES.medium)}.webp`,
      large: `${base}/${String(IMAGE_SIZES.large)}.webp`,
    };
  }
}
