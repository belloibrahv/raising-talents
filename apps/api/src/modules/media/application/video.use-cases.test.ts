import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryRateLimiter,
  InMemoryUnitOfWork,
} from '../../../platform/testing/fakes.js';
import { createAccountsHarness } from '../../accounts/testing/accounts-harness.js';
import { MediaEvents } from '../domain/media-asset.js';
import { FakeVideoProvider } from '../testing/fake-video-provider.js';
import {
  InMemoryMediaAssetRepository,
  InMemoryObjectStorage,
  ScriptedScanner,
} from '../testing/fakes.js';
import { MediaFacade, RemoveDeletedMediaHandler } from './media.facade.js';
import { MediaPresenter } from './media-presenter.js';
import { MediaUrls } from './media-urls.js';
import {
  AbandonedUploadsJob,
  CompleteUploadHandler,
  CreateUploadIntentHandler,
  GetMediaQuery,
  HandleVideoProviderEventHandler,
  ScanVideoHandler,
} from './media.use-cases.js';

describe('Video pipeline', () => {
  let clock: FixedClock;
  let events: InMemoryEventRecorder;
  let assets: InMemoryMediaAssetRepository;
  let storage: InMemoryObjectStorage;
  let video: FakeVideoProvider;
  let scanner: ScriptedScanner;
  let createIntent: CreateUploadIntentHandler;
  let complete: CompleteUploadHandler;
  let get: GetMediaQuery;
  let providerEvents: HandleVideoProviderEventHandler;
  let scanVideo: ScanVideoHandler;
  let remove: RemoveDeletedMediaHandler;
  let abandoned: AbandonedUploadsJob;
  let facade: MediaFacade;
  let talentId: string;
  let accounts: ReturnType<typeof createAccountsHarness>;
  const logger = pino({ level: 'silent' });

  async function requestVideo(): Promise<{ mediaId: string; uploadId: string }> {
    const intent = await createIntent.execute({
      userId: talentId,
      purpose: 'portfolio',
      contentType: 'video/mp4',
      bytes: 48_000_000,
    });
    if (!intent.ok) throw new Error(intent.error.message);
    const uploadId = intent.value.upload.url.split('/').pop() ?? '';
    return { mediaId: intent.value.mediaId, uploadId };
  }

  /** The worker side: scans and releases, draining events raised along the way. */
  async function runWorker(): Promise<void> {
    while (events.events.length > 0) {
      const event = events.events.shift();
      if (event?.type === MediaEvents.VideoTranscoded) await scanVideo.handle(event);
      if (event?.type === MediaEvents.Deleted || event?.type === MediaEvents.Rejected)
        await remove.handle(event);
    }
  }

  const ready = (mediaId: string, uploadId: string, durationSeconds = 38.2) =>
    providerEvents.execute({
      type: 'asset_ready',
      mediaId,
      assetId: `asset-for-${uploadId}`,
      playbackId: `play-${mediaId}`,
      durationSeconds,
    });

  beforeEach(async () => {
    clock = new FixedClock();
    events = new InMemoryEventRecorder();
    accounts = createAccountsHarness(events, clock);
    assets = new InMemoryMediaAssetRepository(events);
    storage = new InMemoryObjectStorage();
    video = new FakeVideoProvider();
    scanner = new ScriptedScanner();
    const uow = new InMemoryUnitOfWork();
    const presenter = new MediaPresenter(new MediaUrls('https://media.test'), video);
    createIntent = new CreateUploadIntentHandler(
      assets,
      storage,
      video,
      accounts.facade,
      new InMemoryRateLimiter(),
      clock,
    );
    complete = new CompleteUploadHandler(assets, storage, video, presenter, uow, clock);
    get = new GetMediaQuery(assets, presenter);
    providerEvents = new HandleVideoProviderEventHandler(assets, video, uow, clock, logger);
    scanVideo = new ScanVideoHandler(
      assets,
      video,
      scanner,
      { reviewAt: 50, rejectAt: 80 },
      uow,
      clock,
      logger,
    );
    remove = new RemoveDeletedMediaHandler(assets, storage, video, logger);
    abandoned = new AbandonedUploadsJob(assets, storage, video, uow, clock, logger);
    facade = new MediaFacade(assets, presenter, clock);
    talentId = await accounts.createAccount({ email: 'chidi.eze@example.com', role: 'talent' });
    events.events.length = 0;
  });

  it('hands the phone a PUT upload at the provider, tagged with the media id', async () => {
    const { mediaId, uploadId } = await requestVideo();
    expect(video.uploads.get(uploadId)?.passthrough).toBe(mediaId);
    expect(storage.presigned).toEqual([]);
    expect(assets.rows.get(mediaId)?.providerUploadId).toBe(uploadId);
  });

  it('says the upload has not finished until the provider has the file', async () => {
    const { mediaId, uploadId } = await requestVideo();
    const early = await complete.execute({ userId: talentId, mediaId });
    expect(early.ok ? null : early.error.code).toBe('MEDIA_NOT_UPLOADED');

    video.receiveFile(uploadId);
    const done = await complete.execute({ userId: talentId, mediaId });
    expect(done.ok && done.value).toMatchObject({
      kind: 'video',
      status: 'processing',
      video: null,
    });
  });

  it('becomes playable after transcoding and a clean scan of every frame', async () => {
    const { mediaId, uploadId } = await requestVideo();
    video.receiveFile(uploadId);
    await complete.execute({ userId: talentId, mediaId });
    await ready(mediaId, uploadId);
    await runWorker();

    const owner = await get.execute({ viewerId: talentId, mediaId });
    if (!owner.ok) throw new Error(owner.error.message);
    expect(owner.value).toMatchObject({
      status: 'ready',
      urls: null,
      video: { durationSeconds: 38.2 },
    });
    expect(owner.value.video?.streamUrl).toContain(`play-${mediaId}`);
    const agent = await get.execute({ viewerId: 'someone-else', mediaId });
    expect(agent.ok).toBe(true);
  });

  it('holds a clip when any frame is borderline, and deletes it at the provider when rejected', async () => {
    const first = await requestVideo();
    scanner.labels = [{ name: 'Swimwear or Underwear', parentName: null, confidence: 70 }];
    await ready(first.mediaId, first.uploadId);
    await runWorker();
    expect(assets.rows.get(first.mediaId)?.status).toBe('held_for_review');

    const second = await requestVideo();
    scanner.labels = [{ name: 'Graphic Violence', parentName: null, confidence: 95 }];
    await ready(second.mediaId, second.uploadId);
    await runWorker();
    expect(assets.rows.get(second.mediaId)?.status).toBe('rejected');
    expect(video.deletedAssets).toEqual([`asset-for-${second.uploadId}`]);
  });

  it('rejects a clip that is too long without scanning it, and deletes it', async () => {
    const { mediaId, uploadId } = await requestVideo();
    await ready(mediaId, uploadId, 95);
    await runWorker();
    expect(assets.rows.get(mediaId)?.status).toBe('rejected');
    expect(video.deletedAssets).toEqual([`asset-for-${uploadId}`]);
  });

  it('marks the asset failed when the provider cannot process it', async () => {
    const { mediaId } = await requestVideo();
    await providerEvents.execute({ type: 'asset_errored', mediaId, reason: 'Unsupported codec' });
    expect(assets.rows.get(mediaId)?.status).toBe('failed');
  });

  it('ignores events for media it does not know, or that is an image', async () => {
    await expect(
      providerEvents.execute({ type: 'asset_errored', mediaId: 'unknown', reason: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('deletes the provider asset when the owner discards a video', async () => {
    const { mediaId, uploadId } = await requestVideo();
    await ready(mediaId, uploadId);
    await runWorker();
    await facade.discard(mediaId, talentId);
    await runWorker();
    expect(video.deletedAssets).toEqual([`asset-for-${uploadId}`]);
  });

  it('closes intents left for over an hour, cancels their uploads and removes partial files', async () => {
    const left = await requestVideo();
    const image = await createIntent.execute({
      userId: talentId,
      purpose: 'portfolio',
      contentType: 'image/jpeg',
      bytes: 900_000,
    });
    if (!image.ok) throw new Error(image.error.message);
    storage.simulateUpload(
      image.value.upload.fields['key'] ?? '',
      Buffer.from('jpeg'),
      'image/jpeg',
    );

    clock.advanceSeconds(59 * 60);
    await abandoned.run();
    expect(assets.rows.get(left.mediaId)?.status).toBe('awaiting_upload');

    clock.advanceSeconds(2 * 60);
    const fresh = await requestVideo();
    await abandoned.run();
    expect(assets.rows.get(left.mediaId)?.status).toBe('failed');
    expect(assets.rows.get(image.value.mediaId)?.status).toBe('failed');
    expect(assets.rows.get(fresh.mediaId)?.status).toBe('awaiting_upload');
    expect(video.cancelledUploads).toEqual([left.uploadId]);
    expect(storage.objects.size).toBe(0);
  });

  it('deletes a clip at the provider when it finishes after the intent was closed', async () => {
    const { mediaId, uploadId } = await requestVideo();
    clock.advanceSeconds(2 * 3600);
    await abandoned.run();
    await ready(mediaId, uploadId);
    expect(assets.rows.get(mediaId)?.status).toBe('failed');
    expect(video.deletedAssets).toEqual([`asset-for-${uploadId}`]);
  });

  it('keeps closing intents when cleaning one of them up fails', async () => {
    const first = await requestVideo();
    const second = await requestVideo();
    video.cancelUpload = () => Promise.reject(new Error('Mux answered 500'));
    clock.advanceSeconds(2 * 3600);
    await abandoned.run();
    expect(assets.rows.get(first.mediaId)?.status).toBe('failed');
    expect(assets.rows.get(second.mediaId)?.status).toBe('failed');
  });

  it('refuses video when no provider is set up', async () => {
    const disabled = new CreateUploadIntentHandler(
      assets,
      storage,
      Object.assign(new FakeVideoProvider(), { enabled: false }),
      accounts.facade,
      new InMemoryRateLimiter(),
      clock,
    );
    const result = await disabled.execute({
      userId: talentId,
      purpose: 'portfolio',
      contentType: 'video/mp4',
      bytes: 1000,
    });
    expect(result.ok ? null : result.error.code).toBe('MEDIA_TYPE_NOT_ALLOWED');
  });
});
