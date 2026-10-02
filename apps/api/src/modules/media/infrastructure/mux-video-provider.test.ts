import { createHmac, generateKeyPairSync } from 'node:crypto';
import { createLocalJWKSet, decodeProtectedHeader, exportJWK, importSPKI, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../../platform/testing/fakes.js';
import {
  MuxApiError,
  MuxPlaybackSigner,
  MuxVideoProvider,
  MuxWebhookVerifier,
  type MuxSettings,
} from './mux-video-provider.js';

// Mux hands out PKCS#1 RSA keys; the signer must take them as they come.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const settings: MuxSettings = {
  tokenId: 'token-id',
  tokenSecret: 'token-secret',
  signingKeyId: 'signing-key-1',
  signingPrivateKeyBase64: Buffer.from(privateKey).toString('base64'),
  playbackTtlSeconds: 3600,
};

const tokenOf = (url: string) => new URL(url).searchParams.get('token') ?? '';

describe('MuxPlaybackSigner', () => {
  const clock = new FixedClock(new Date('2026-10-02T12:00:00.000Z'));
  const signer = new MuxPlaybackSigner(settings, clock);

  it('signs stream and poster links that Mux can verify with the public key', async () => {
    const playback = await signer.sign('playback-abc', 42);
    const key = await importSPKI(publicKey, 'RS256');
    const options = { currentDate: clock.now() };

    const stream = await jwtVerify(tokenOf(playback.streamUrl), key, { ...options, audience: 'v' });
    expect(stream.payload.sub).toBe('playback-abc');
    expect(decodeProtectedHeader(tokenOf(playback.streamUrl)).kid).toBe('signing-key-1');

    const poster = await jwtVerify(tokenOf(playback.posterUrl), key, { ...options, audience: 't' });
    expect(poster.payload['time']).toBe(1);
    expect(playback.expiresAt).toBe('2026-10-02T13:00:00.000Z');
    expect(playback.streamUrl.startsWith('https://stream.mux.com/playback-abc.m3u8?token=')).toBe(
      true,
    );
  });

  it('puts thumbnail options inside the token, as signed playback requires', async () => {
    const url = await signer.thumbnailUrl('playback-abc', 21);
    const jwks = createLocalJWKSet({
      keys: [{ ...(await exportJWK(await importSPKI(publicKey, 'RS256'))), kid: 'signing-key-1' }],
    });
    const { payload } = await jwtVerify(tokenOf(url), jwks, { currentDate: clock.now() });
    expect(payload).toMatchObject({ time: 21, width: 1024, aud: 't' });
    expect(new URL(url).searchParams.has('time')).toBe(false);
  });
});

describe('MuxVideoProvider', () => {
  function stubFetch(responses: { status: number; body?: unknown }[]) {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift() ?? { status: 200, body: {} };
      return new Response(next.body === undefined ? null : JSON.stringify(next.body), {
        status: next.status,
      });
    }) as typeof fetch;
    return { calls, fetchFn };
  }
  const signer = new MuxPlaybackSigner(settings, new FixedClock());

  it('creates a signed-playback upload that carries the media id back in webhooks', async () => {
    const { calls, fetchFn } = stubFetch([
      { status: 201, body: { data: { id: 'up-1', url: 'https://storage.mux.test/up-1' } } },
    ]);
    const upload = await new MuxVideoProvider(settings, signer, fetchFn).createUpload({
      passthrough: 'media-1',
    });
    expect(upload).toEqual({ uploadId: 'up-1', url: 'https://storage.mux.test/up-1' });
    expect(calls[0]?.url).toBe('https://api.mux.com/video/v1/uploads');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['authorization']).toBe(
      `Basic ${Buffer.from('token-id:token-secret').toString('base64')}`,
    );
    expect(JSON.parse(calls[0]?.init?.body as string)).toMatchObject({
      timeout: 600,
      new_asset_settings: { playback_policies: ['signed'], passthrough: 'media-1' },
    });
  });

  it('treats deleting a missing asset as done, and fails loudly on anything else', async () => {
    const { fetchFn } = stubFetch([{ status: 404 }, { status: 500 }]);
    const provider = new MuxVideoProvider(settings, signer, fetchFn);
    await expect(provider.deleteAsset('gone')).resolves.toBeUndefined();
    await expect(provider.deleteAsset('broken')).rejects.toBeInstanceOf(MuxApiError);
  });

  it('reads the upload status and its asset', async () => {
    const { fetchFn } = stubFetch([
      { status: 200, body: { data: { status: 'asset_created', asset_id: 'as-1' } } },
    ]);
    const status = await new MuxVideoProvider(settings, signer, fetchFn).uploadStatus('up-1');
    expect(status).toEqual({ status: 'asset_created', assetId: 'as-1' });
  });
});

describe('MuxWebhookVerifier', () => {
  const clock = new FixedClock(new Date('2026-10-02T12:00:00.000Z'));
  const verifier = new MuxWebhookVerifier('webhook-secret', clock);
  const body = Buffer.from(JSON.stringify({ type: 'video.asset.ready', data: {} }));
  const sign = (timestamp: number, payload = body, secret = 'webhook-secret') =>
    `t=${String(timestamp)},v1=${createHmac('sha256', secret)
      .update(`${String(timestamp)}.`)
      .update(payload)
      .digest('hex')}`;
  const nowSeconds = clock.now().getTime() / 1000;

  it('accepts a fresh signature over the exact body', () => {
    expect(verifier.verify(body, sign(nowSeconds - 30))).toBe(true);
  });

  it('refuses a changed body, another secret, an old timestamp and a missing header', () => {
    expect(verifier.verify(Buffer.from(`${body.toString()} `), sign(nowSeconds))).toBe(false);
    expect(verifier.verify(body, sign(nowSeconds, body, 'another-secret'))).toBe(false);
    expect(verifier.verify(body, sign(nowSeconds - 301))).toBe(false);
    expect(verifier.verify(body, undefined)).toBe(false);
    expect(verifier.verify(body, 't=abc,v1=00')).toBe(false);
  });

  it('reads the three events the pipeline uses and ignores the rest', () => {
    expect(
      verifier.parse({
        type: 'video.upload.asset_created',
        data: { id: 'up-1', asset_id: 'as-1', new_asset_settings: { passthrough: 'm-1' } },
      }),
    ).toEqual({ type: 'upload_asset_created', mediaId: 'm-1', assetId: 'as-1' });
    expect(
      verifier.parse({
        type: 'video.asset.ready',
        data: {
          id: 'as-1',
          passthrough: 'm-1',
          duration: 33.4,
          playback_ids: [
            { id: 'public-id', policy: 'public' },
            { id: 'signed-id', policy: 'signed' },
          ],
        },
      }),
    ).toEqual({
      type: 'asset_ready',
      mediaId: 'm-1',
      assetId: 'as-1',
      playbackId: 'signed-id',
      durationSeconds: 33.4,
    });
    expect(
      verifier.parse({
        type: 'video.asset.errored',
        data: { id: 'as-1', passthrough: 'm-1', errors: { messages: ['Invalid file'] } },
      }),
    ).toEqual({ type: 'asset_errored', mediaId: 'm-1', reason: 'Invalid file' });
    expect(verifier.parse({ type: 'video.asset.created', data: { id: 'as-1' } })).toBeNull();
    expect(verifier.parse({ type: 'video.asset.ready', data: { id: 'as-1' } })).toBeNull();
  });
});
