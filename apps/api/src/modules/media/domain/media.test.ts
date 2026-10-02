import { describe, expect, it } from 'vitest';
import { MediaAsset, MediaEvents } from './media-asset.js';
import { decideScan, type ModerationLabel } from './scan-decision.js';

const policy = { reviewAt: 50, rejectAt: 80 };
const label = (
  name: string,
  confidence: number,
  parentName: string | null = null,
): ModerationLabel => ({ name, parentName, confidence });
const now = new Date('2026-10-02T09:00:00.000Z');

describe('decideScan', () => {
  it('publishes when nothing reaches the review threshold', () => {
    expect(decideScan([label('Swimwear or Underwear', 31)], policy)).toEqual({ outcome: 'ready' });
    expect(decideScan([], policy)).toEqual({ outcome: 'ready' });
  });

  it('holds anything between review and reject, whatever the category', () => {
    const decision = decideScan([label('Swimwear or Underwear', 72), label('Alcohol', 20)], policy);
    expect(decision).toEqual({ outcome: 'held', labels: [label('Swimwear or Underwear', 72)] });
    expect(decideScan([label('Explicit Nudity', 65, 'Explicit')], policy).outcome).toBe('held');
  });

  it('rejects the categories the design names, matched by name or by parent', () => {
    const byName = decideScan([label('Hate Symbols', 91)], policy);
    const byParent = decideScan([label('Exposed Male Genitalia', 97, 'Explicit Nudity')], policy);
    expect(byName.outcome === 'rejected' && byName.category).toBe('hate');
    expect(byParent.outcome === 'rejected' && byParent.category).toBe('sexual');
  });

  it('holds, rather than rejects, a high score in a category the design does not reject', () => {
    expect(decideScan([label('Alcohol', 95)], policy).outcome).toBe('held');
  });
});

describe('MediaAsset', () => {
  const requested = () => {
    const result = MediaAsset.requestUpload({
      id: 'm1',
      ownerId: 'u1',
      purpose: 'avatar',
      contentType: 'image/jpeg',
      bytes: 900_000,
      now,
    });
    if (!result.ok) throw new Error('expected success');
    return result.value;
  };

  it('refuses files over 15 MB before any upload happens', () => {
    const result = MediaAsset.requestUpload({
      id: 'm1',
      ownerId: 'u1',
      purpose: 'avatar',
      contentType: 'image/jpeg',
      bytes: 16 * 1024 * 1024,
      now,
    });
    expect(!result.ok && result.error.code).toBe('MEDIA_TOO_LARGE');
  });

  it('keeps originals under pending/ and variants under media/', () => {
    const asset = requested();
    expect(asset.originalKey).toBe('pending/u1/m1');
    expect(asset.variantKey('medium')).toBe('media/u1/m1/1024.webp');
  });

  it('fails an upload that is larger or of another type than requested', () => {
    const bigger = requested();
    expect(bigger.confirmUpload({ bytes: 900_001, contentType: 'image/jpeg' }, now).ok).toBe(false);
    expect(bigger.status).toBe('failed');
    const otherType = requested();
    expect(otherType.confirmUpload({ bytes: 1000, contentType: 'image/png' }, now).ok).toBe(false);
  });

  it('walks processing, scanning and a decision, raising one event per step that matters', () => {
    const asset = requested();
    expect(asset.confirmUpload({ bytes: 850_000, contentType: 'image/jpeg' }, now).ok).toBe(true);
    asset.markProcessed(now);
    asset.applyScan({ outcome: 'ready' }, now);
    expect(asset.status).toBe('ready');
    expect(asset.pullEvents().map((event) => event.type)).toEqual([
      MediaEvents.Uploaded,
      MediaEvents.Ready,
    ]);
  });

  it('tells the owner why, in plain words, without the raw labels', () => {
    const asset = requested();
    asset.confirmUpload({ bytes: 850_000, contentType: 'image/jpeg' }, now);
    asset.markProcessed(now);
    asset.applyScan(
      { outcome: 'rejected', category: 'violence', labels: [label('Graphic Violence', 93)] },
      now,
    );
    expect(asset.snapshot().rejectionReason).toContain('graphic violence');
  });

  it('cannot be confirmed twice', () => {
    const asset = requested();
    asset.confirmUpload({ bytes: 850_000, contentType: 'image/jpeg' }, now);
    const again = asset.confirmUpload({ bytes: 850_000, contentType: 'image/jpeg' }, now);
    expect(!again.ok && again.error.code).toBe('MEDIA_WRONG_STATE');
  });
});

describe('MediaAsset video', () => {
  const requestVideo = (bytes = 80_000_000) => {
    const result = MediaAsset.requestUpload({
      id: 'v1',
      ownerId: 'u1',
      purpose: 'portfolio',
      contentType: 'video/mp4',
      bytes,
      now,
    });
    if (!result.ok) throw new Error(result.error.message);
    result.value.attachProviderUpload('upload-1');
    return result.value;
  };
  const transcoded = { providerAssetId: 'asset-1', playbackId: 'play-1', durationSeconds: 42.5 };

  it('allows video for the portfolio only, up to 300 MB', () => {
    const avatar = MediaAsset.requestUpload({
      id: 'v',
      ownerId: 'u1',
      purpose: 'avatar',
      contentType: 'video/mp4',
      bytes: 1000,
      now,
    });
    expect(avatar.ok ? null : avatar.error.code).toBe('MEDIA_TYPE_NOT_ALLOWED');
    const huge = MediaAsset.requestUpload({
      id: 'v',
      ownerId: 'u1',
      purpose: 'portfolio',
      contentType: 'video/quicktime',
      bytes: 301 * 1024 * 1024,
      now,
    });
    expect(huge.ok ? null : huge.error.message).toBe('Videos can be up to 300 MB.');
    expect(requestVideo().kind).toBe('video');
    expect(requestVideo().storedKeys).toEqual([]);
  });

  it('goes from upload to scanning, raising the event the worker scans on', () => {
    const asset = requestVideo();
    expect(asset.confirmVideoUpload('asset-1', now).ok).toBe(true);
    asset.videoTranscoded(transcoded, now);
    expect(asset.status).toBe('scanning');
    expect(asset.snapshot()).toMatchObject({ playbackId: 'play-1', durationSeconds: 42.5 });
    expect(asset.pullEvents().map((event) => event.type)).toEqual([
      MediaEvents.Uploaded,
      MediaEvents.VideoTranscoded,
    ]);
  });

  it('copes with the ready webhook arriving before the upload is confirmed', () => {
    const asset = requestVideo();
    asset.videoTranscoded(transcoded, now);
    expect(asset.status).toBe('scanning');
    expect(asset.snapshot().providerAssetId).toBe('asset-1');
  });

  it('ignores repeated events', () => {
    const asset = requestVideo();
    asset.confirmVideoUpload('asset-1', now);
    asset.videoTranscoded(transcoded, now);
    asset.pullEvents();
    asset.confirmVideoUpload('asset-1', now);
    asset.videoTranscoded(transcoded, now);
    expect(asset.status).toBe('scanning');
    expect(asset.pullEvents()).toEqual([]);
  });

  it('rejects a clip over 60 seconds and tells the owner how to fix it', () => {
    const asset = requestVideo();
    asset.videoTranscoded({ ...transcoded, durationSeconds: 61.2 }, now);
    expect(asset.status).toBe('rejected');
    expect(asset.snapshot().rejectionReason).toBe(
      'Videos can be up to 60 seconds. Trim it and upload again.',
    );
  });

  it('words a scan rejection for video', () => {
    const asset = requestVideo();
    asset.videoTranscoded(transcoded, now);
    asset.applyScan({ outcome: 'rejected', category: 'violence', labels: [] }, now);
    expect(asset.snapshot().rejectionReason).toMatch(
      /^This video looks like it shows graphic violence/,
    );
  });

  it('closes an intent nobody finished, and leaves anything further along alone', () => {
    const abandoned = requestVideo();
    abandoned.abandon(now);
    expect(abandoned.status).toBe('failed');
    const confirmed = requestVideo();
    confirmed.confirmVideoUpload('asset-1', now);
    confirmed.abandon(now);
    expect(confirmed.status).toBe('processing');
  });
});
