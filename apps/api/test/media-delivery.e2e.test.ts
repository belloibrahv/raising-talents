import { afterAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const OWNER = '0192a3b4-0000-7000-8000-0000000000e1';
const MEDIA = '0192a3b4-0000-7000-8000-0000000000e2';

describe('Serving images from a private bucket', () => {
  const apps: TestApp[] = [];
  const start = async (overrides: Record<string, string> = {}) => {
    const testApp = await createTestApp(overrides);
    apps.push(testApp);
    testApp.storage.simulateUpload(
      `media/${OWNER}/${MEDIA}/256.webp`,
      Buffer.from('webp'),
      'image/webp',
    );
    testApp.storage.simulateUpload(
      `uploads/${OWNER}/${MEDIA}`,
      Buffer.from('original'),
      'image/jpeg',
    );
    return testApp;
  };
  const get = (testApp: TestApp, url: string) => testApp.app.inject({ method: 'GET', url });

  afterAll(async () => {
    await Promise.all(apps.map((testApp) => testApp.app.close()));
  });

  it('serves processed variants, cached for a year, when delivery is through the API', async () => {
    const testApp = await start({ MEDIA_DELIVERY: 'api' });
    const image = await get(testApp, `/media/${OWNER}/${MEDIA}/256.webp`);
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(image.body).toBe('webp');
  });

  it('serves nothing else: no originals, no other files, no missing variants', async () => {
    const testApp = await start({ MEDIA_DELIVERY: 'api' });
    for (const url of [
      `/media/${OWNER}/${MEDIA}/1024.webp`,
      `/media/${OWNER}/${MEDIA}/original.jpg`,
      `/media/${OWNER}/../uploads/${MEDIA}`,
      `/media/not-an-id/${MEDIA}/256.webp`,
    ]) {
      expect((await get(testApp, url)).statusCode).toBe(404);
    }
  });

  it('answers nothing when a CDN serves the bucket', async () => {
    const testApp = await start();
    expect((await get(testApp, `/media/${OWNER}/${MEDIA}/256.webp`)).statusCode).toBe(404);
  });
});
