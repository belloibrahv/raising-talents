import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryRateLimiter,
  InMemoryUnitOfWork,
} from '../../../platform/testing/fakes.js';
import { createAccountsHarness } from '../../accounts/testing/accounts-harness.js';
import { SetApprovedAvatarHandler } from '../../talent-profiles/application/set-approved-avatar.handler.js';
import { TalentProfile } from '../../talent-profiles/domain/talent-profile.js';
import { InMemoryTalentProfileRepository } from '../../talent-profiles/testing/in-memory-talent-profile.repository.js';
import { MediaEvents } from '../domain/media-asset.js';
import {
  FakeImageProcessor,
  InMemoryMediaAssetRepository,
  InMemoryObjectStorage,
  ScriptedScanner,
} from '../testing/fakes.js';
import { MediaUrls } from './media-urls.js';
import {
  CompleteUploadHandler,
  CreateUploadIntentHandler,
  GetMediaQuery,
  ProcessImageHandler,
} from './media.use-cases.js';

const BIO = 'Left winger from Surulere. Fast on the break, comfortable on either foot.';

describe('Image pipeline', () => {
  let clock: FixedClock;
  let events: InMemoryEventRecorder;
  let accounts: ReturnType<typeof createAccountsHarness>;
  let assets: InMemoryMediaAssetRepository;
  let storage: InMemoryObjectStorage;
  let scanner: ScriptedScanner;
  let profiles: InMemoryTalentProfileRepository;
  let createIntent: CreateUploadIntentHandler;
  let complete: CompleteUploadHandler;
  let process: ProcessImageHandler;
  let get: GetMediaQuery;
  let setAvatar: SetApprovedAvatarHandler;
  let talentId: string;
  const urls = new MediaUrls('https://media.staging.raisingtalents.app');

  /** Asks for an intent, uploads like the phone does, and confirms. Returns the media id. */
  async function upload(
    body = Buffer.from('jpeg-bytes'),
    contentType = 'image/jpeg',
  ): Promise<string> {
    const intent = await createIntent.execute({
      userId: talentId,
      purpose: 'avatar',
      contentType,
      bytes: 2_000_000,
    });
    if (!intent.ok) throw new Error(intent.error.message);
    storage.simulateUpload(intent.value.upload.fields['key'] ?? '', body, contentType);
    const done = await complete.execute({ userId: talentId, mediaId: intent.value.mediaId });
    if (!done.ok) throw new Error(done.error.message);
    return intent.value.mediaId;
  }

  /** What the worker does with the outbox: keeps draining, because handlers raise new events. */
  async function runWorker(): Promise<void> {
    while (events.events.length > 0) {
      const event = events.events.shift();
      if (event?.type === MediaEvents.Uploaded) await process.handle(event);
      if (event?.type === MediaEvents.Ready) await setAvatar.handle(event);
    }
  }

  beforeEach(async () => {
    clock = new FixedClock();
    events = new InMemoryEventRecorder();
    accounts = createAccountsHarness(events, clock);
    assets = new InMemoryMediaAssetRepository(events);
    storage = new InMemoryObjectStorage();
    scanner = new ScriptedScanner();
    profiles = new InMemoryTalentProfileRepository(events);
    const uow = new InMemoryUnitOfWork();
    createIntent = new CreateUploadIntentHandler(
      assets,
      storage,
      accounts.facade,
      new InMemoryRateLimiter(),
      clock,
    );
    complete = new CompleteUploadHandler(assets, storage, urls, uow, clock);
    process = new ProcessImageHandler(
      assets,
      storage,
      new FakeImageProcessor(),
      scanner,
      { reviewAt: 50, rejectAt: 80 },
      uow,
      clock,
      pino({ level: 'silent' }),
    );
    get = new GetMediaQuery(assets, urls);
    setAvatar = new SetApprovedAvatarHandler(profiles, accounts.facade, uow, clock);
    talentId = await accounts.createAccount({ email: 'amaka.okafor@example.com', role: 'talent' });
  });

  it('locks the upload to one key, one type and the declared size', async () => {
    const intent = await createIntent.execute({
      userId: talentId,
      purpose: 'avatar',
      contentType: 'image/png',
      bytes: 1_500_000,
    });
    expect(intent.ok).toBe(true);
    expect(storage.presigned[0]).toMatchObject({ contentType: 'image/png', maxBytes: 1_500_000 });
    expect(storage.presigned[0]?.key).toMatch(new RegExp(`^pending/${talentId}/`));
  });

  it('turns an approved avatar into the profile picture and completes onboarding', async () => {
    const started = TalentProfile.start({
      userId: talentId,
      handle: 'amaka.okafor',
      now: clock.now(),
    });
    if (!started.ok) throw new Error('start failed');
    started.value.apply(
      {
        displayName: 'Amaka Okafor',
        categorySlug: 'sports',
        subcategorySlugs: ['football'],
        citySlug: 'ng-lagos',
        bio: BIO,
      },
      clock.now(),
    );
    await profiles.save(started.value);
    events.events.splice(0);

    const mediaId = await upload();
    await runWorker();

    const asset = await get.execute({ viewerId: talentId, mediaId });
    expect(asset.ok && asset.value).toMatchObject({
      status: 'ready',
      urls: {
        medium: `https://media.staging.raisingtalents.app/media/${talentId}/${mediaId}/1024.webp`,
      },
    });
    expect(storage.objects.has(`pending/${talentId}/${mediaId}`)).toBe(false);
    expect(storage.objects.has(`media/${talentId}/${mediaId}/2048.webp`)).toBe(true);
    expect((await profiles.findByUserId(talentId))?.isComplete).toBe(true);
    expect((await accounts.repository.findById(talentId))?.snapshot().status).toBe('active');
  });

  it('refuses to complete before the file is uploaded', async () => {
    const intent = await createIntent.execute({
      userId: talentId,
      purpose: 'avatar',
      contentType: 'image/jpeg',
      bytes: 1000,
    });
    if (!intent.ok) throw new Error('intent failed');
    const result = await complete.execute({ userId: talentId, mediaId: intent.value.mediaId });
    expect(!result.ok && result.error.code).toBe('MEDIA_NOT_UPLOADED');
  });

  it('fails and deletes an upload that does not match its intent', async () => {
    const intent = await createIntent.execute({
      userId: talentId,
      purpose: 'avatar',
      contentType: 'image/jpeg',
      bytes: 10,
    });
    if (!intent.ok) throw new Error('intent failed');
    const key = intent.value.upload.fields['key'] ?? '';
    storage.simulateUpload(key, Buffer.from('a much larger body than declared'), 'image/jpeg');
    const result = await complete.execute({ userId: talentId, mediaId: intent.value.mediaId });
    expect(!result.ok && result.error.code).toBe('MEDIA_UPLOAD_MISMATCH');
    expect(storage.objects.has(key)).toBe(false);
    expect(assets.rows.get(intent.value.mediaId)?.status).toBe('failed');
  });

  it('marks a file that is not an image as failed', async () => {
    const mediaId = await upload(Buffer.from('not-an-image: a renamed PDF'));
    await runWorker();
    expect(assets.rows.get(mediaId)?.status).toBe('failed');
  });

  it('holds borderline images for a moderator and never shows them to others', async () => {
    scanner.labels = [{ name: 'Swimwear or Underwear', parentName: null, confidence: 71 }];
    const mediaId = await upload();
    await runWorker();
    const other = await accounts.createAccount({ email: 'scout@example.com', role: 'agent' });
    expect(
      (await get.execute({ viewerId: talentId, mediaId })).ok && assets.rows.get(mediaId)?.status,
    ).toBe('held_for_review');
    const asOther = await get.execute({ viewerId: other, mediaId });
    expect(!asOther.ok && asOther.error.code).toBe('NOT_FOUND');
  });

  it('rejects explicit images, tells the owner why, and deletes every copy', async () => {
    scanner.labels = [{ name: 'Explicit Nudity', parentName: 'Explicit', confidence: 96 }];
    const mediaId = await upload();
    await runWorker();
    const view = await get.execute({ viewerId: talentId, mediaId });
    expect(view.ok && view.value).toMatchObject({ status: 'rejected', urls: null });
    expect(view.ok && view.value.rejectionReason).toContain('Community Guidelines');
    expect([...storage.objects.keys()].filter((key) => key.includes(mediaId))).toEqual([]);
  });

  it('survives a scanner outage: the event is retried and picks up where it stopped', async () => {
    scanner.failNext = true;
    const mediaId = await upload();
    const uploaded = events.ofType(MediaEvents.Uploaded).at(0);
    if (!uploaded) throw new Error('no upload event');
    await expect(process.handle(uploaded)).rejects.toThrow('throttled');
    expect(assets.rows.get(mediaId)?.status).toBe('processing');
    await process.handle(uploaded);
    expect(assets.rows.get(mediaId)?.status).toBe('ready');
  });

  it('answers a repeated complete with the current state instead of an error', async () => {
    const mediaId = await upload();
    const again = await complete.execute({ userId: talentId, mediaId });
    expect(again.ok && again.value.status).toBe('processing');
  });

  it('keeps agents and unverified accounts from uploading profile media', async () => {
    const agent = await accounts.createAccount({ email: 'chidi@example.com', role: 'agent' });
    const unverified = await accounts.createAccount({
      email: 'new@example.com',
      role: 'talent',
      verified: false,
    });
    const asAgent = await createIntent.execute({
      userId: agent,
      purpose: 'avatar',
      contentType: 'image/jpeg',
      bytes: 1000,
    });
    const asUnverified = await createIntent.execute({
      userId: unverified,
      purpose: 'avatar',
      contentType: 'image/jpeg',
      bytes: 1000,
    });
    expect(!asAgent.ok && asAgent.error.code).toBe('WRONG_ROLE');
    expect(!asUnverified.ok && asUnverified.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});
