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
import { FakeVideoProvider } from '../testing/fake-video-provider.js';
import {
  FakeImageProcessor,
  InMemoryMediaAssetRepository,
  InMemoryObjectStorage,
  ScriptedScanner,
} from '../testing/fakes.js';
import { RemoveDeletedMediaHandler } from './media.facade.js';
import { MediaPresenter } from './media-presenter.js';
import { MediaUrls } from './media-urls.js';
import {
  CompleteUploadHandler,
  CreateUploadIntentHandler,
  ProcessImageHandler,
} from './media.use-cases.js';
import { DecideHeldMediaHandler, ListHeldMediaQuery } from './moderation.use-cases.js';

const BIO = 'Left winger from Surulere. Fast on the break, comfortable on either foot.';
const BORDERLINE = [{ name: 'Swimwear or Underwear', parentName: null, confidence: 64 }];

describe('Moderation of held media', () => {
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
  let setAvatar: SetApprovedAvatarHandler;
  let remove: RemoveDeletedMediaHandler;
  let list: ListHeldMediaQuery;
  let decide: DecideHeldMediaHandler;
  let talentId: string;
  let moderatorId: string;

  async function upload(purpose: 'avatar' | 'portfolio' = 'avatar'): Promise<string> {
    const intent = await createIntent.execute({
      userId: talentId,
      purpose,
      contentType: 'image/jpeg',
      bytes: 900_000,
    });
    if (!intent.ok) throw new Error(intent.error.message);
    storage.simulateUpload(
      intent.value.upload.fields['key'] ?? '',
      Buffer.from('jpeg'),
      'image/jpeg',
    );
    const done = await complete.execute({ userId: talentId, mediaId: intent.value.mediaId });
    if (!done.ok) throw new Error(done.error.message);
    return intent.value.mediaId;
  }

  async function runWorker(): Promise<void> {
    while (events.events.length > 0) {
      const event = events.events.shift();
      if (event?.type === MediaEvents.Uploaded) await process.handle(event);
      if (event?.type === MediaEvents.Ready) await setAvatar.handle(event);
      if (event?.type === MediaEvents.Rejected) await remove.handle(event);
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
    const video = new FakeVideoProvider();
    const urls = new MediaUrls('https://media.test');
    const presenter = new MediaPresenter(urls, video);
    const logger = pino({ level: 'silent' });
    createIntent = new CreateUploadIntentHandler(
      assets,
      storage,
      video,
      accounts.facade,
      new InMemoryRateLimiter(),
      clock,
    );
    complete = new CompleteUploadHandler(assets, storage, video, presenter, uow, clock);
    process = new ProcessImageHandler(
      assets,
      storage,
      new FakeImageProcessor(),
      scanner,
      { reviewAt: 50, rejectAt: 80 },
      uow,
      clock,
      logger,
    );
    setAvatar = new SetApprovedAvatarHandler(profiles, accounts.facade, uow, clock);
    remove = new RemoveDeletedMediaHandler(assets, storage, video, logger);
    list = new ListHeldMediaQuery(assets, accounts.facade, presenter);
    decide = new DecideHeldMediaHandler(assets, accounts.facade, uow, clock, logger);

    talentId = await accounts.createAccount({ email: 'amaka.okafor@example.com', role: 'talent' });
    moderatorId = await accounts.createAccount({
      email: 'moderator.one@raisingtalents.app',
      role: null,
    });
    const granted = await accounts.facade.grantStaffRole(
      'moderator.one@raisingtalents.app',
      'moderator',
    );
    expect(granted.ok).toBe(true);

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
    events.events.length = 0;
    scanner.labels = BORDERLINE;
  });

  it('shows held media to moderators with what the scanner saw and a preview of the processed file', async () => {
    const mediaId = await upload();
    await runWorker();
    const queue = await list.execute(moderatorId);
    expect(queue.ok && queue.value).toEqual({
      items: [
        {
          id: mediaId,
          ownerId: talentId,
          purpose: 'avatar',
          kind: 'image',
          labels: BORDERLINE,
          urls: {
            small: `https://media.test/media/${talentId}/${mediaId}/256.webp`,
            medium: `https://media.test/media/${talentId}/${mediaId}/1024.webp`,
            large: `https://media.test/media/${talentId}/${mediaId}/2048.webp`,
          },
          video: null,
          heldAt: clock.now().toISOString(),
        },
      ],
      nextCursor: null,
    });
  });

  it('completes onboarding when a held avatar is approved, just as a clean scan would', async () => {
    const mediaId = await upload();
    await runWorker();
    expect((await profiles.findByUserId(talentId))?.isComplete).toBe(false);

    expect(
      (await decide.execute({ moderatorId, mediaId, decision: { decision: 'approve' } })).ok,
    ).toBe(true);
    await runWorker();
    expect((await profiles.findByUserId(talentId))?.snapshot().avatarMediaId).toBe(mediaId);
    const me = await accounts.facade.getMe(talentId);
    expect(me.ok && me.value.status).toBe('active');
    expect(assets.rows.get(mediaId)).toMatchObject({ status: 'ready', reviewedBy: moderatorId });
  });

  it('rejects with a reason the owner can read, and removes the files', async () => {
    const mediaId = await upload('portfolio');
    await runWorker();
    await decide.execute({
      moderatorId,
      mediaId,
      decision: { decision: 'reject', category: 'other' },
    });
    await runWorker();
    expect(assets.rows.get(mediaId)).toMatchObject({
      status: 'rejected',
      rejectionReason: 'This image breaks the Community Guidelines, so it cannot be shown.',
    });
    expect([...storage.objects.keys()].filter((key) => key.includes(mediaId))).toEqual([]);
    const queue = await list.execute(moderatorId);
    expect(queue.ok && queue.value.items).toEqual([]);
  });

  it('refuses a second decision and anyone who is not staff', async () => {
    const mediaId = await upload();
    await runWorker();
    await decide.execute({ moderatorId, mediaId, decision: { decision: 'approve' } });
    const twice = await decide.execute({ moderatorId, mediaId, decision: { decision: 'approve' } });
    expect(twice.ok ? null : twice.error.code).toBe('MEDIA_WRONG_STATE');

    const asTalent = await list.execute(talentId);
    const decideAsTalent = await decide.execute({
      moderatorId: talentId,
      mediaId,
      decision: { decision: 'approve' },
    });
    expect(asTalent.ok ? null : asTalent.error.code).toBe('FORBIDDEN');
    expect(decideAsTalent.ok ? null : decideAsTalent.error.code).toBe('FORBIDDEN');
  });

  it('pages through a long queue, oldest first', async () => {
    const ids: string[] = [];
    for (let n = 0; n < 23; n += 1) {
      ids.push(await upload('portfolio'));
      await runWorker();
      clock.advanceSeconds(1);
    }
    const first = await list.execute(moderatorId);
    if (!first.ok) throw new Error(first.error.message);
    const second = await list.execute(moderatorId, first.value.nextCursor ?? undefined);
    if (!second.ok) throw new Error(second.error.message);
    expect([...first.value.items, ...second.value.items].map((item) => item.id)).toEqual(ids);
    expect(second.value.nextCursor).toBeNull();
  });

  it('keeps talent and agent accounts out of staff roles', async () => {
    const promoted = await accounts.facade.grantStaffRole('amaka.okafor@example.com', 'admin');
    expect(promoted.ok).toBe(true); // role chosen but not locked yet: still a fresh account
    const agentId = await accounts.createAccount({ email: 'scout@example.com', role: 'agent' });
    await accounts.facade.completeOnboarding(agentId);
    const lockedAgent = await accounts.facade.grantStaffRole('scout@example.com', 'moderator');
    expect(lockedAgent.ok ? null : lockedAgent.error.code).toBe('ROLE_ALREADY_LOCKED');
  });
});
