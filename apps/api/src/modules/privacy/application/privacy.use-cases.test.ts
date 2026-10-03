import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { err, ok } from '../../../platform/result.js';
import { domainError } from '../../../platform/domain-error.js';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryRateLimiter,
  InMemoryUnitOfWork,
} from '../../../platform/testing/fakes.js';
import { createAccountsHarness } from '../../accounts/testing/accounts-harness.js';
import { IdentityFacade } from '../../identity/application/identity.facade.js';
import {
  FakePasswordHasher,
  InMemoryCredentialRepository,
  InMemorySessionRepository,
} from '../../identity/testing/fakes.js';
import { MediaFacade } from '../../media/application/media.facade.js';
import { MediaPresenter } from '../../media/application/media-presenter.js';
import { MediaUrls } from '../../media/application/media-urls.js';
import { MediaAsset } from '../../media/domain/media-asset.js';
import { FakeVideoProvider } from '../../media/testing/fake-video-provider.js';
import { InMemoryMediaAssetRepository, InMemoryObjectStorage } from '../../media/testing/fakes.js';
import {
  AccountErasureJob,
  CancelDeletionHandler,
  ExportMyDataQuery,
  RequestDeletionHandler,
  type PrivacySources,
} from './privacy.use-cases.js';

const PASSWORD = 'relay-baton-ikorodu-26';

describe('Account deletion and data export', () => {
  let clock: FixedClock;
  let events: InMemoryEventRecorder;
  let accounts: ReturnType<typeof createAccountsHarness>;
  let assets: InMemoryMediaAssetRepository;
  let storage: InMemoryObjectStorage;
  let video: FakeVideoProvider;
  let requestDeletion: RequestDeletionHandler;
  let cancelDeletion: CancelDeletionHandler;
  let exportData: ExportMyDataQuery;
  let erasure: AccountErasureJob;
  let userId: string;

  beforeEach(async () => {
    clock = new FixedClock();
    events = new InMemoryEventRecorder();
    const uow = new InMemoryUnitOfWork();
    accounts = createAccountsHarness(events, clock);
    const credentials = new InMemoryCredentialRepository();
    const hasher = new FakePasswordHasher();
    assets = new InMemoryMediaAssetRepository(events);
    storage = new InMemoryObjectStorage();
    video = new FakeVideoProvider();
    const media = new MediaFacade(
      assets,
      new MediaPresenter(new MediaUrls('https://media.test'), video),
      clock,
      storage,
      video,
    );
    const sources: PrivacySources = {
      talentProfile: async () => err(domainError('NOT_FOUND', 'none')),
      agentProfile: async () => err(domainError('WRONG_ROLE', 'not an agent')),
      agentVerification: async () => err(domainError('WRONG_ROLE', 'not an agent')),
      portfolio: async () => ok({ items: [], maxItems: 30, version: 0 }),
      shortlist: async () => [],
      notifications: async () => [],
    };
    requestDeletion = new RequestDeletionHandler(
      accounts.facade,
      new IdentityFacade(credentials, hasher, new InMemorySessionRepository(), clock),
      new InMemoryRateLimiter(),
      uow,
      30,
    );
    cancelDeletion = new CancelDeletionHandler(accounts.facade, uow);
    exportData = new ExportMyDataQuery(
      accounts.facade,
      media,
      sources,
      new InMemoryRateLimiter(),
      clock,
    );
    erasure = new AccountErasureJob(accounts.facade, media, uow, pino({ level: 'silent' }));

    userId = await accounts.createAccount({
      email: 'funmi.adebayo@example.com',
      role: 'talent',
      dateOfBirth: '1996-06-14',
    });
    await accounts.facade.completeOnboarding(userId);
    credentials.hashes.set(userId, await hasher.hash(PASSWORD));

    const requested = MediaAsset.requestUpload({
      id: 'media-1',
      ownerId: userId,
      purpose: 'portfolio',
      contentType: 'image/jpeg',
      bytes: 1000,
      now: clock.now(),
    });
    if (!requested.ok) throw new Error('upload');
    await assets.save(requested.value);
    for (const size of ['256', '1024', '2048'])
      storage.simulateUpload(
        `media/${userId}/media-1/${size}.webp`,
        Buffer.from('webp'),
        'image/webp',
      );
  });

  it('needs the current password, then schedules deletion 30 days out', async () => {
    const wrong = await requestDeletion.execute(userId, 'not-my-password');
    expect(wrong.ok ? null : wrong.error.code).toBe('INVALID_CREDENTIALS');

    const scheduled = await requestDeletion.execute(userId, PASSWORD);
    expect(scheduled.ok && scheduled.value).toMatchObject({
      status: 'pending_deletion',
      deletionScheduledAt: new Date(clock.now().getTime() + 30 * 86_400_000).toISOString(),
    });
    expect(events.ofType('accounts.DeletionRequested')).toHaveLength(1);
  });

  it('can be cancelled, which puts the account back as it was', async () => {
    await requestDeletion.execute(userId, PASSWORD);
    const kept = await cancelDeletion.execute(userId);
    expect(kept.ok && kept.value).toMatchObject({ status: 'active', deletionScheduledAt: null });
  });

  it('erases nothing before the date, then the files and the account after it', async () => {
    await requestDeletion.execute(userId, PASSWORD);
    clock.advanceDays(29);
    await erasure.run();
    expect(accounts.repository.rows.has(userId)).toBe(true);

    clock.advanceDays(1);
    await erasure.run();
    expect(accounts.repository.rows.has(userId)).toBe(false);
    expect([...storage.objects.keys()].filter((key) => key.includes(userId))).toEqual([]);
    expect(events.ofType('accounts.AccountDeleted')).toHaveLength(1);
  });

  it('exports everything held, in one document, and missing parts as null', async () => {
    const exported = await exportData.execute(userId);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value.account).toMatchObject({
      email: 'funmi.adebayo@example.com',
      dateOfBirth: '1996-06-14',
      role: 'talent',
      status: 'active',
    });
    expect(exported.value.talentProfile).toBeNull();
    expect(exported.value.agentProfile).toBeNull();
    expect(exported.value.portfolio).toEqual({ items: [], maxItems: 30, version: 0 });
    expect(exported.value.media).toEqual([
      {
        id: 'media-1',
        purpose: 'portfolio',
        kind: 'image',
        status: 'awaiting_upload',
        urls: null,
        video: null,
      },
    ]);
  });
});
