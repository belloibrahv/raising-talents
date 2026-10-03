import { afterAll, describe, expect, it } from 'vitest';
import { MEDIA } from '../src/modules/media/application/media.use-cases.js';
import type { MediaUrls } from '../src/modules/media/application/media-urls.js';
import { MediaAsset, type MediaAssetProps } from '../src/modules/media/domain/media-asset.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const OWNER = '0192a3b4-0000-7000-8000-0000000000e1';
const READY = '0192a3b4-0000-7000-8000-0000000000e2';
const HELD = '0192a3b4-0000-7000-8000-0000000000e3';

const asset = (id: string, status: MediaAssetProps['status']): MediaAsset =>
  MediaAsset.restore({
    id,
    ownerId: OWNER,
    purpose: 'portfolio',
    status,
    contentType: 'image/jpeg',
    declaredBytes: 1000,
    actualBytes: 1000,
    moderationLabels: [],
    rejectionReason: null,
    failureReason: null,
    readyAt: status === 'ready' ? new Date() : null,
    providerUploadId: null,
    providerAssetId: null,
    playbackId: null,
    durationSeconds: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

describe('Serving images from a private bucket', () => {
  const apps: TestApp[] = [];
  const start = async (overrides: Record<string, string> = {}) => {
    const testApp = await createTestApp(overrides);
    apps.push(testApp);
    for (const [id, status] of [
      [READY, 'ready'],
      [HELD, 'held_for_review'],
    ] as const) {
      await testApp.mediaAssets.save(asset(id, status));
      testApp.storage.simulateUpload(
        `media/${OWNER}/${id}/256.webp`,
        Buffer.from('webp'),
        'image/webp',
      );
    }
    testApp.storage.simulateUpload(
      `uploads/${OWNER}/${READY}`,
      Buffer.from('original'),
      'image/jpeg',
    );
    return testApp;
  };
  const get = (testApp: TestApp, url: string) => testApp.app.inject({ method: 'GET', url });

  afterAll(async () => {
    await Promise.all(apps.map((testApp) => testApp.app.close()));
  });

  it('serves approved variants to anyone, cached for a day', async () => {
    const testApp = await start({ MEDIA_DELIVERY: 'api' });
    const image = await get(testApp, `/media/${OWNER}/${READY}/256.webp`);
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['cache-control']).toBe('public, max-age=86400');
    expect(image.body).toBe('webp');
  });

  it('serves a held image only through a moderator signed preview link, never cached', async () => {
    const testApp = await start({ MEDIA_DELIVERY: 'api' });
    expect((await get(testApp, `/media/${OWNER}/${HELD}/256.webp`)).statusCode).toBe(404);
    const preview = testApp.moduleRef.get<MediaUrls>(MEDIA.Urls).forPreview(OWNER, HELD).small;
    const path = preview.replace('https://media.test', '');
    expect(path).toMatch(/\?expires=\d+&signature=/);
    const signed = await get(testApp, path);
    expect(signed.statusCode).toBe(200);
    expect(signed.headers['cache-control']).toBe('private, no-store');

    expect(
      (await get(testApp, path.replace(/signature=[^&]+/, 'signature=forged'))).statusCode,
    ).toBe(404);
    // A genuine signature for one owner's image does not open the same id under another owner.
    expect((await get(testApp, path.replace(`/${OWNER}/`, `/${READY}/`))).statusCode).toBe(404);
    testApp.clock.advanceSeconds(3 * 3600);
    expect((await get(testApp, path)).statusCode).toBe(404);
  });

  it('serves nothing else: no originals, other files, unknown ids or wrong owners', async () => {
    const testApp = await start({ MEDIA_DELIVERY: 'api' });
    for (const url of [
      `/media/${OWNER}/${READY}/1024.webp`,
      `/media/${OWNER}/${READY}/original.jpg`,
      `/media/${OWNER}/../uploads/${READY}`,
      `/media/not-an-id/${READY}/256.webp`,
      `/media/${HELD}/${READY}/256.webp`,
    ]) {
      expect((await get(testApp, url)).statusCode).toBe(404);
    }
  });

  it('answers nothing when a CDN serves the bucket', async () => {
    const testApp = await start();
    expect((await get(testApp, `/media/${OWNER}/${READY}/256.webp`)).statusCode).toBe(404);
  });
});
