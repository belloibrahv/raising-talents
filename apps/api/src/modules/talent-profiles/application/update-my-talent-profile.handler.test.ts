import { beforeEach, describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryUnitOfWork,
} from '../../../platform/testing/fakes.js';
import { createAccountsHarness } from '../../accounts/testing/accounts-harness.js';
import { sampleTaxonomySource } from '../../taxonomy/testing/sample-taxonomy.js';
import { TalentProfileEvents } from '../domain/talent-profile.events.js';
import { InMemoryTalentProfileRepository } from '../testing/in-memory-talent-profile.repository.js';
import { MediaUrls } from '../../media/application/media-urls.js';
import { GetPublicTalentProfileQuery } from './get-talent-profile.queries.js';
import { UpdateMyTalentProfileHandler } from './update-my-talent-profile.handler.js';

const BIO = 'Left winger from Surulere. Fast on the break, comfortable on either foot.';

const media = new MediaUrls('https://media.staging.raisingtalents.app');
const urls = (ownerId: string, mediaId: string) => media.forImage(ownerId, mediaId);

describe('UpdateMyTalentProfileHandler', () => {
  let clock: FixedClock;
  let events: InMemoryEventRecorder;
  let accounts: ReturnType<typeof createAccountsHarness>;
  let profiles: InMemoryTalentProfileRepository;
  let handler: UpdateMyTalentProfileHandler;
  let publicQuery: GetPublicTalentProfileQuery;
  let talentId: string;

  beforeEach(async () => {
    clock = new FixedClock();
    events = new InMemoryEventRecorder();
    accounts = createAccountsHarness(events, clock);
    profiles = new InMemoryTalentProfileRepository(events);
    handler = new UpdateMyTalentProfileHandler(
      profiles,
      accounts.facade,
      sampleTaxonomySource,
      new InMemoryUnitOfWork(),
      clock,
      urls,
      () => 0.5,
    );
    publicQuery = new GetPublicTalentProfileQuery(
      profiles,
      accounts.facade,
      sampleTaxonomySource,
      urls,
    );
    talentId = await accounts.createAccount({ email: 'amaka.okafor@example.com', role: 'talent' });
  });

  it('creates the profile on the first step with a handle from the name', async () => {
    const result = await handler.execute({
      userId: talentId,
      expectedVersion: null,
      patch: { displayName: 'Amaka Okafor' },
    });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value).toMatchObject({
      handle: 'amaka.okafor',
      displayName: 'Amaka Okafor',
      version: 1,
      isComplete: false,
    });
    expect(result.value.missing).toEqual(['category', 'subcategories', 'city', 'bio', 'avatar']);
  });

  it('adds a number when the name-based handle is taken', async () => {
    const other = await accounts.createAccount({
      email: 'another.amaka@example.com',
      role: 'talent',
    });
    await handler.execute({
      userId: other,
      expectedVersion: null,
      patch: { displayName: 'Amaka Okafor' },
    });
    const result = await handler.execute({
      userId: talentId,
      expectedVersion: null,
      patch: { displayName: 'Amaka Okafor' },
    });
    // The test's random source returns 0.5: 0.5 * 9000 + 100 = 4600.
    expect(result.ok && result.value.handle).toBe('amaka.okafor4600');
  });

  it('requires the current version once the profile exists', async () => {
    await handler.execute({
      userId: talentId,
      expectedVersion: null,
      patch: { displayName: 'Amaka Okafor' },
    });
    const missing = await handler.execute({
      userId: talentId,
      expectedVersion: null,
      patch: { bio: BIO },
    });
    const stale = await handler.execute({
      userId: talentId,
      expectedVersion: 7,
      patch: { bio: BIO },
    });
    const current = await handler.execute({
      userId: talentId,
      expectedVersion: 1,
      patch: { bio: BIO },
    });
    expect(!missing.ok && missing.error.code).toBe('PRECONDITION_REQUIRED');
    expect(!stale.ok && stale.error.code).toBe('PRECONDITION_FAILED');
    expect(current.ok && current.value.version).toBe(2);
  });

  it('names categories, subcategories, skills and the city from the taxonomy', async () => {
    const result = await handler.execute({
      userId: talentId,
      expectedVersion: null,
      patch: {
        categorySlug: 'sports',
        subcategorySlugs: ['football'],
        skillSlugs: ['sprinting', 'yoruba'],
        citySlug: 'ng-lagos',
      },
    });
    expect(result.ok && result.value).toMatchObject({
      category: { slug: 'sports', name: 'Sports' },
      subcategories: [{ slug: 'football', name: 'Football' }],
      skills: [{ name: 'Sprinting' }, { name: 'Yoruba' }],
      city: { name: 'Lagos', countryCode: 'NG' },
    });
  });

  it('refuses a subcategory from another category and saves nothing', async () => {
    const result = await handler.execute({
      userId: talentId,
      expectedVersion: null,
      patch: { categorySlug: 'sports', subcategorySlugs: ['singer'] },
    });
    expect(!result.ok && result.error.code).toBe('UNKNOWN_TAXONOMY');
  });

  it('refuses a handle someone else has', async () => {
    const other = await accounts.createAccount({
      email: 'tunde.bakare@example.com',
      role: 'talent',
    });
    await handler.execute({
      userId: other,
      expectedVersion: null,
      patch: { handle: 'tunde.fast' },
    });
    const result = await handler.execute({
      userId: talentId,
      expectedVersion: null,
      patch: { handle: 'tunde.fast' },
    });
    expect(!result.ok && result.error.code).toBe('HANDLE_TAKEN');
  });

  it('keeps agents out, and lets unverified talent build a profile (ADR-037)', async () => {
    const agent = await accounts.createAccount({ email: 'scout@example.com', role: 'agent' });
    const unverified = await accounts.createAccount({
      email: 'new.talent@example.com',
      role: 'talent',
      verified: false,
    });
    const asAgent = await handler.execute({
      userId: agent,
      expectedVersion: null,
      patch: { displayName: 'Scout' },
    });
    const asUnverified = await handler.execute({
      userId: unverified,
      expectedVersion: null,
      patch: { displayName: 'New' },
    });
    expect(!asAgent.ok && asAgent.error.code).toBe('WRONG_ROLE');
    expect(asUnverified.ok).toBe(true);
  });

  it('completes onboarding, locks the role and goes public once the avatar is approved', async () => {
    const step = await handler.execute({
      userId: talentId,
      expectedVersion: null,
      patch: {
        displayName: 'Amaka Okafor',
        categorySlug: 'sports',
        subcategorySlugs: ['football'],
        citySlug: 'ng-lagos',
        bio: BIO,
        gender: 'female',
      },
    });
    if (!step.ok) throw new Error(step.error.message);
    expect(step.value.missing).toEqual(['avatar']);
    expect((await publicQuery.execute('amaka.okafor')).ok).toBe(false);

    // The media module does this after scanning; simulated here.
    const profile = await profiles.findByUserId(talentId);
    if (!profile) throw new Error('missing profile');
    profile.setApprovedAvatar('0192a3b4-0000-7000-8000-0000000000aa', clock.now());
    await profiles.save(profile);
    await accounts.facade.completeOnboarding(talentId);

    const account = await accounts.repository.findById(talentId);
    expect(account?.snapshot()).toMatchObject({ status: 'active', role: 'talent' });
    expect(account?.snapshot().roleLockedAt).not.toBeNull();

    const view = await publicQuery.execute('Amaka.Okafor');
    if (!view.ok) throw new Error(view.error.message);
    expect(view.value).toMatchObject({ displayName: 'Amaka Okafor', ageYears: 25, gender: null });
    expect(view.value.avatarUrls?.medium).toBe(
      `https://media.staging.raisingtalents.app/media/${talentId}/0192a3b4-0000-7000-8000-0000000000aa/1024.webp`,
    );
    expect(JSON.stringify(view.value)).not.toContain('2001-04-17');
    expect(events.ofType(TalentProfileEvents.Completed)).toHaveLength(1);
  });

  it('shows gender publicly only when the talent chooses to', async () => {
    const step = await handler.execute({
      userId: talentId,
      expectedVersion: null,
      patch: {
        displayName: 'Amaka Okafor',
        categorySlug: 'sports',
        subcategorySlugs: ['football'],
        citySlug: 'ng-lagos',
        bio: BIO,
        gender: 'female',
        genderSearchable: true,
      },
    });
    if (!step.ok) throw new Error(step.error.message);
    const profile = await profiles.findByUserId(talentId);
    if (!profile) throw new Error('missing profile');
    profile.setApprovedAvatar('0192a3b4-0000-7000-8000-0000000000aa', clock.now());
    await profiles.save(profile);
    await accounts.facade.completeOnboarding(talentId);
    const view = await publicQuery.execute('amaka.okafor');
    expect(view.ok && view.value.gender).toBe('female');
  });
});
