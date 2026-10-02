import { createHmac, createPrivateKey, timingSafeEqual, type KeyObject } from 'node:crypto';
import { SignJWT } from 'jose';
import { UPLOAD_INTENT_TTL_SECONDS } from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import type {
  PlaybackSigner,
  ProviderUploadStatus,
  VideoProvider,
  VideoProviderEvent,
  VideoWebhookVerifier,
} from '../application/ports.js';

const API = 'https://api.mux.com/video/v1';
const STREAM = 'https://stream.mux.com';
const IMAGE = 'https://image.mux.com';
const TIMEOUT_MS = 10_000;

/** Frames at these points of the clip are scanned. Three catch most of a 60-second clip. */
const FRAME_POINTS = [0.1, 0.5, 0.9] as const;

export interface MuxSettings {
  readonly tokenId: string;
  readonly tokenSecret: string;
  readonly signingKeyId: string;
  /** Base64 of the PEM, as Mux hands it out. PKCS#1 or PKCS#8. */
  readonly signingPrivateKeyBase64: string;
  readonly playbackTtlSeconds: number;
}

export class MuxApiError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`Mux ${path} answered ${String(status)}`);
  }
}

/** Signs Mux playback and thumbnail tokens. Mux's own options must be claims, not query parameters. */
export class MuxPlaybackSigner implements PlaybackSigner {
  private readonly key: KeyObject;

  constructor(
    private readonly settings: MuxSettings,
    private readonly clock: Clock,
  ) {
    this.key = createPrivateKey(Buffer.from(settings.signingPrivateKeyBase64, 'base64').toString());
  }

  async sign(playbackId: string, durationSeconds: number) {
    const expiresAt =
      Math.floor(this.clock.now().getTime() / 1000) + this.settings.playbackTtlSeconds;
    const [video, poster] = await Promise.all([
      this.token(playbackId, 'v', expiresAt),
      this.token(playbackId, 't', expiresAt, { time: Math.min(1, durationSeconds / 2) }),
    ]);
    return {
      streamUrl: `${STREAM}/${playbackId}.m3u8?token=${video}`,
      posterUrl: `${IMAGE}/${playbackId}/thumbnail.webp?token=${poster}`,
      durationSeconds,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  /** A JPEG frame at one moment, sized for the content scanner. */
  async thumbnailUrl(playbackId: string, timeSeconds: number): Promise<string> {
    const expiresAt = Math.floor(this.clock.now().getTime() / 1000) + 300;
    const token = await this.token(playbackId, 't', expiresAt, { time: timeSeconds, width: 1024 });
    return `${IMAGE}/${playbackId}/thumbnail.jpg?token=${token}`;
  }

  private token(
    playbackId: string,
    audience: 'v' | 't',
    expiresAt: number,
    claims: Record<string, number> = {},
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: this.settings.signingKeyId })
      .setSubject(playbackId)
      .setAudience(audience)
      .setExpirationTime(expiresAt)
      .sign(this.key);
  }
}

export class MuxVideoProvider implements VideoProvider {
  readonly enabled = true;

  constructor(
    private readonly settings: MuxSettings,
    private readonly signer: MuxPlaybackSigner,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async createUpload(input: { passthrough: string }) {
    const body = {
      cors_origin: '*',
      timeout: UPLOAD_INTENT_TTL_SECONDS,
      new_asset_settings: {
        playback_policies: ['signed'],
        passthrough: input.passthrough,
        video_quality: 'basic',
      },
    };
    const { data } = await this.call<{ data: { id: string; url: string } }>(
      'POST',
      '/uploads',
      body,
    );
    return { uploadId: data.id, url: data.url };
  }

  async uploadStatus(uploadId: string) {
    const { data } = await this.call<{
      data: { status: ProviderUploadStatus; asset_id?: string };
    }>('GET', `/uploads/${encodeURIComponent(uploadId)}`);
    return { status: data.status, assetId: data.asset_id ?? null };
  }

  async thumbnails(playbackId: string, durationSeconds: number): Promise<readonly Buffer[]> {
    const frames: Buffer[] = [];
    for (const point of FRAME_POINTS) {
      const url = await this.signer.thumbnailUrl(playbackId, Math.floor(durationSeconds * point));
      const response = await this.fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new MuxApiError(response.status, '/thumbnail');
      frames.push(Buffer.from(await response.arrayBuffer()));
    }
    return frames;
  }

  async deleteAsset(assetId: string): Promise<void> {
    await this.call('DELETE', `/assets/${encodeURIComponent(assetId)}`, undefined, [404]);
  }

  async cancelUpload(uploadId: string): Promise<void> {
    // Mux refuses to cancel an upload that already finished or expired; either way nothing is left to stop.
    await this.call(
      'PUT',
      `/uploads/${encodeURIComponent(uploadId)}/cancel`,
      undefined,
      [404, 400],
    );
  }

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    tolerated: readonly number[] = [],
  ): Promise<T> {
    const auth = Buffer.from(`${this.settings.tokenId}:${this.settings.tokenSecret}`).toString(
      'base64',
    );
    const response = await this.fetchFn(`${API}${path}`, {
      method,
      headers: {
        authorization: `Basic ${auth}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (tolerated.includes(response.status)) return undefined as T;
    if (!response.ok) throw new MuxApiError(response.status, path);
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
}

/** Refuses video. The default where Mux is not set up, such as a laptop without credentials. */
export class DisabledVideoProvider implements VideoProvider, PlaybackSigner {
  readonly enabled = false;
  private refuse(): never {
    throw new Error('Video is disabled. Set VIDEO_PROVIDER=mux and the MUX_ settings.');
  }
  createUpload(): never {
    return this.refuse();
  }
  uploadStatus(): never {
    return this.refuse();
  }
  thumbnails(): never {
    return this.refuse();
  }
  deleteAsset(): never {
    return this.refuse();
  }
  cancelUpload(): never {
    return this.refuse();
  }
  sign(): never {
    return this.refuse();
  }
}

const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Checks the mux-signature header (t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">)
 * and turns the events we act on into provider-neutral ones. Anything else is null.
 */
export class MuxWebhookVerifier implements VideoWebhookVerifier {
  constructor(
    private readonly secret: string,
    private readonly clock: Clock,
  ) {}

  verify(rawBody: Buffer, header: string | undefined): boolean {
    if (!header) return false;
    const parts = new Map(
      header.split(',').map((part) => {
        const [key, ...value] = part.split('=');
        return [key?.trim() ?? '', value.join('=').trim()] as const;
      }),
    );
    const timestamp = Number(parts.get('t'));
    const signature = parts.get('v1');
    if (!Number.isInteger(timestamp) || !signature) return false;
    const age = Math.abs(this.clock.now().getTime() / 1000 - timestamp);
    if (age > SIGNATURE_TOLERANCE_SECONDS) return false;
    const expected = createHmac('sha256', this.secret)
      .update(`${String(timestamp)}.`)
      .update(rawBody)
      .digest();
    const given = Buffer.from(signature, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  parse(body: unknown): VideoProviderEvent | null {
    const event = body as {
      type?: string;
      data?: {
        id?: string;
        asset_id?: string;
        passthrough?: string;
        duration?: number;
        playback_ids?: { id: string; policy: string }[];
        new_asset_settings?: { passthrough?: string };
        errors?: { messages?: string[] };
      };
    };
    const data = event.data;
    if (!data) return null;
    if (event.type === 'video.upload.asset_created') {
      const mediaId = data.new_asset_settings?.passthrough;
      return mediaId && data.asset_id
        ? { type: 'upload_asset_created', mediaId, assetId: data.asset_id }
        : null;
    }
    if (event.type === 'video.asset.ready') {
      const playbackId = data.playback_ids?.find((playback) => playback.policy === 'signed')?.id;
      return data.passthrough && data.id && playbackId && typeof data.duration === 'number'
        ? {
            type: 'asset_ready',
            mediaId: data.passthrough,
            assetId: data.id,
            playbackId,
            durationSeconds: data.duration,
          }
        : null;
    }
    if (event.type === 'video.asset.errored') {
      return data.passthrough
        ? {
            type: 'asset_errored',
            mediaId: data.passthrough,
            reason: data.errors?.messages?.join(' ') || 'The video could not be processed.',
          }
        : null;
    }
    return null;
  }
}
