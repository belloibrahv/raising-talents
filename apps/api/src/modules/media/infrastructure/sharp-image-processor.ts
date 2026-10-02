import sharp from 'sharp';
import { IMAGE_SIZES } from '../domain/media-asset.js';
import { InvalidImageError, type ImageProcessor, type ImageVariant } from '../application/ports.js';

/** Refuses images whose pixel count could exhaust memory (a decompression bomb). About 50 megapixels. */
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * Decodes the upload, applies the phone's rotation, drops every piece of metadata
 * (EXIF, GPS, camera details) and writes WebP at each size. Never enlarges.
 */
export class SharpImageProcessor implements ImageProcessor {
  async process(original: Buffer): Promise<readonly ImageVariant[]> {
    try {
      await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    } catch {
      throw new InvalidImageError('Not a readable image');
    }
    return Promise.all(
      (Object.keys(IMAGE_SIZES) as (keyof typeof IMAGE_SIZES)[]).map(async (size) => ({
        size,
        body: await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
          .rotate()
          .resize({
            width: IMAGE_SIZES[size],
            height: IMAGE_SIZES[size],
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 82 })
          .toBuffer(),
      })),
    );
  }
}
