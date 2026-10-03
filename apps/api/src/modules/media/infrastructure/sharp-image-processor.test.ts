import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { InvalidImageError } from '../application/ports.js';
import { SharpImageProcessor } from './sharp-image-processor.js';

/** A real 3000x2000 JPEG carrying GPS coordinates for Surulere, Lagos, as a phone might send. */
async function photoWithLocation(): Promise<Buffer> {
  return sharp({
    create: { width: 3000, height: 2000, channels: 3, background: { r: 210, g: 120, b: 40 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: 'Tecno', Model: 'Camon 30' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '6/1 30/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '3/1 21/1 0/1',
      },
    })
    .toBuffer();
}

// Real image encoding is CPU-heavy. While CI builds other packages in parallel it can pass
// the 5 second default, so this file alone gets more time.
describe('SharpImageProcessor', { timeout: 20_000 }, () => {
  const processor = new SharpImageProcessor();

  it('the test photo really carries location data', async () => {
    const metadata = await sharp(await photoWithLocation()).metadata();
    expect(metadata.exif?.toString('latin1')).toContain('Tecno');
  });

  it('writes WebP at 256, 1024 and 2048 px with every piece of metadata removed', async () => {
    const variants = await processor.process(await photoWithLocation());
    expect(variants.map((variant) => variant.size)).toEqual(['small', 'medium', 'large']);
    for (const variant of variants) {
      const metadata = await sharp(variant.body).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(Math.max(metadata.width, metadata.height)).toBeLessThanOrEqual(
        { small: 256, medium: 1024, large: 2048 }[variant.size],
      );
    }
  });

  it('never enlarges a small image', async () => {
    const small = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#2b6' },
    })
      .png()
      .toBuffer();
    const large = (await processor.process(small)).find((variant) => variant.size === 'large');
    expect((await sharp(large?.body).metadata()).width).toBe(400);
  });

  it('refuses files that are not images', async () => {
    await expect(
      processor.process(Buffer.from('%PDF-1.7 renamed to photo.jpg')),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });
});
