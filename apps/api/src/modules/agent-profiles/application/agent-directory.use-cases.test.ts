import { beforeEach, describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryRateLimiter,
  InMemoryUnitOfWork,
} from '../../../platform/testing/fakes.js';
import { createAccountsHarness } from '../../accounts/testing/accounts-harness.js';
import { sampleTaxonomySource } from '../../taxonomy/testing/sample-taxonomy.js';
import {
  InMemoryAgentListing,
  InMemorySavedAgentRepository,
} from '../testing/in-memory-agent-listing.js';
import { InMemoryAgentProfileRepository } from '../testing/in-memory-agent-profile.repository.js';
import {
  GetAgentQuery,
  ListSavedAgentsQuery,
  SaveAgentHandler,
  SavedAgentsExport,
  SearchAgentsHandler,
  UnsaveAgentHandler,
  type AgentAvatarUrls,
} from './agent-directory.use-cases.js';
import { AgentAvatarHandler, UpdateMyAgentProfileHandler } from './agent-profile.use-cases.js';

const urls: AgentAvatarUrls = (ownerId, mediaId) => ({
  small: `https://media.test/${ownerId}/${mediaId}/256.webp`,
  medium: `https://media.test/${ownerId}/${mediaId}/1024.webp`,
  large: `https://media.test/${ownerId}/${mediaId}/2048.webp`,
});

describe('agents as talent find them', () => {
  let clock: FixedClock;
  let events: InMemoryEventRecorder;
  let accounts: ReturnType<typeof createAccountsHarness>;
  let profiles: InMemoryAgentProfileRepository;
  let saved: InMemorySavedAgentRepository;
  let update: UpdateMyAgentProfileHandler;
  let search: SearchAgentsHandler;
  let get: GetAgentQuery;
  let save: SaveAgentHandler;
  let unsave: UnsaveAgentHandler;
  let listSaved: ListSavedAgentsQuery;
  let talentId: string;
  let eko: string;
  let northstar: string;

  /** An agent with a finished profile; verified unless told otherwise. */
  async function agent(
    email: string,
    patch: Record<string, unknown>,
    verified = true,
  ): Promise<string> {
    const id = await accounts.createAccount({ email, role: 'agent' });
    const result = await update.execute({
      userId: id,
      expectedVersion: null,
      patch: {
        jobTitle: 'Scout',
        specializationSlugs: ['sports'],
        citySlug: 'ng-lagos',
        ...patch,
      },
    });
    if (!result.ok) throw new Error(result.error.message);
    if (verified) {
      const profile = await profiles.findByUserId(id);
      profile?.markVerified(clock.now());
      if (profile) await profiles.save(profile);
      clock.advanceSeconds(60);
    }
    return id;
  }

  const found = async (viewerId: string, query: Record<string, string> = {}) => {
    const result = await search.execute(viewerId, query);
    if (!result.ok) throw new Error(result.error.message);
    return result.value.items.map((item) => item.agencyName);
  };

  beforeEach(async () => {
    clock = new FixedClock();
    events = new InMemoryEventRecorder();
    accounts = createAccountsHarness(events, clock);
    profiles = new InMemoryAgentProfileRepository(events);
    saved = new InMemorySavedAgentRepository();
    const listing = new InMemoryAgentListing(
      profiles,
      async (userId) =>
        (await accounts.repository.findById(userId))?.snapshot().status === 'active',
    );
    update = new UpdateMyAgentProfileHandler(
      profiles,
      accounts.facade,
      sampleTaxonomySource,
      new InMemoryUnitOfWork(),
      clock,
      urls,
    );
    search = new SearchAgentsHandler(
      listing,
      saved,
      accounts.facade,
      sampleTaxonomySource,
      urls,
      new InMemoryRateLimiter(),
    );
    get = new GetAgentQuery(profiles, listing, saved, accounts.facade, sampleTaxonomySource, urls);
    save = new SaveAgentHandler(listing, saved, accounts.facade, clock);
    unsave = new UnsaveAgentHandler(saved, accounts.facade);
    listSaved = new ListSavedAgentsQuery(
      listing,
      saved,
      accounts.facade,
      sampleTaxonomySource,
      urls,
    );

    talentId = await accounts.createAccount({ email: 'ngozi@example.com', role: 'talent' });
    await accounts.facade.completeOnboarding(talentId);
    eko = await agent('tunde@eko.example', {
      agencyName: 'Eko Talent Partners',
      bio: 'FIFA licensed. Placed players with clubs in Belgium and Portugal.',
      rosterStatus: 'open',
    });
    northstar = await agent('kemi@northstar.example', {
      agencyName: 'Northstar Scouting',
      specializationSlugs: ['music'],
      citySlug: 'gb-london',
      rosterStatus: 'full',
    });
    await agent('new@unverified.example', { agencyName: 'Not Checked Yet' }, false);
  });

  it('lists only verified agents, the most recently verified first', async () => {
    expect(await found(talentId)).toEqual(['Northstar Scouting', 'Eko Talent Partners']);
  });

  it('filters by words, category, place and who is open for submissions', async () => {
    expect(await found(talentId, { q: 'fifa' })).toEqual(['Eko Talent Partners']);
    expect(await found(talentId, { q: 'northstar' })).toEqual(['Northstar Scouting']);
    expect(await found(talentId, { category: 'music' })).toEqual(['Northstar Scouting']);
    expect(await found(talentId, { country: 'NG' })).toEqual(['Eko Talent Partners']);
    expect(await found(talentId, { city: 'gb-london' })).toEqual(['Northstar Scouting']);
    expect(await found(talentId, { open: 'true' })).toEqual(['Eko Talent Partners']);
    expect(await found(talentId, { q: '100%' })).toEqual([]);
  });

  it('drops an agent who is suspended or renames the agency, until checked again', async () => {
    await accounts.facade.restrict(northstar, 'suspend', 'scam_or_harassment');
    expect(await found(talentId)).toEqual(['Eko Talent Partners']);

    const profile = await profiles.findByUserId(eko);
    await update.execute({
      userId: eko,
      expectedVersion: profile?.version ?? null,
      patch: { agencyName: 'Eko Global' },
    });
    expect(await found(talentId)).toEqual([]);
    const page = await get.execute(talentId, eko);
    expect(page.ok ? null : page.error.code).toBe('NOT_FOUND');
    // The agent still sees their own page, to put it right.
    const own = await get.execute(eko, eko);
    expect(own.ok && own.value).toMatchObject({ agencyName: 'Eko Global', isSelf: true });
  });

  it("shows an agent's page with the bio, the status and no private details", async () => {
    const page = await get.execute(talentId, eko);
    if (!page.ok) throw new Error(page.error.message);
    expect(page.value).toMatchObject({
      id: eko,
      agencyName: 'Eko Talent Partners',
      jobTitle: 'Scout',
      city: { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
      specializations: [{ slug: 'sports', name: 'Sports' }],
      verified: true,
      rosterStatus: 'open',
      bio: 'FIFA licensed. Placed players with clubs in Belgium and Portugal.',
      avatarUrls: null,
      saved: false,
      isSelf: false,
    });
    expect(JSON.stringify(page.value)).not.toContain('tunde@eko.example');
  });

  it('lets talent save an agent, find them again and remove them', async () => {
    expect((await save.execute(talentId, eko)).ok).toBe(true);
    clock.advanceSeconds(5);
    expect((await save.execute(talentId, northstar)).ok).toBe(true);
    // Saving twice changes nothing.
    expect((await save.execute(talentId, eko)).ok).toBe(true);

    const list = await listSaved.execute(talentId);
    expect(list.ok && list.value.items.map((item) => [item.agencyName, item.saved])).toEqual([
      ['Northstar Scouting', true],
      ['Eko Talent Partners', true],
    ]);
    const page = await get.execute(talentId, eko);
    expect(page.ok && page.value.saved).toBe(true);
    expect(await new SavedAgentsExport(saved, profiles).forUser(talentId)).toHaveLength(2);

    expect((await unsave.execute(talentId, eko)).ok).toBe(true);
    const after = await listSaved.execute(talentId);
    expect(after.ok && after.value.items.map((item) => item.agencyName)).toEqual([
      'Northstar Scouting',
    ]);
  });

  it('keeps saving to talent, and to agents who can be found', async () => {
    const asAgent = await save.execute(northstar, eko);
    expect(asAgent.ok ? null : asAgent.error.code).toBe('WRONG_ROLE');
    const unknown = await save.execute(talentId, '0192a3b4-0000-7000-8000-00000000dead');
    expect(unknown.ok ? null : unknown.error.code).toBe('NOT_FOUND');
    const newcomer = await accounts.createAccount({ email: 'new@example.com', role: 'talent' });
    const early = await search.execute(newcomer, {});
    expect(early.ok ? null : early.error.code).toBe('FORBIDDEN');
  });

  it("puts an uploaded photo on the agent's page, and takes it off when removed", async () => {
    const handler = new AgentAvatarHandler(profiles, new InMemoryUnitOfWork(), clock);
    const event = {
      type: 'media.MediaReady',
      aggregateId: '0192a3b4-0000-7000-8000-0000000000aa',
      occurredAt: clock.now(),
      payload: { ownerId: eko, purpose: 'avatar', kind: 'image' },
    };
    await handler.ready(event);
    const withPhoto = await get.execute(talentId, eko);
    expect(withPhoto.ok && withPhoto.value.avatarUrls?.small).toBe(
      `https://media.test/${eko}/0192a3b4-0000-7000-8000-0000000000aa/256.webp`,
    );
    // Still listed and still verified: the photo is not part of what was checked.
    expect(await found(talentId)).toContain('Eko Talent Partners');

    await handler.removed(event);
    const without = await get.execute(talentId, eko);
    expect(without.ok && without.value.avatarUrls).toBeNull();
    // A talent's photo is none of this handler's business.
    await expect(
      handler.ready({ ...event, payload: { ...event.payload, ownerId: talentId } }),
    ).resolves.toBeUndefined();
  });
});
