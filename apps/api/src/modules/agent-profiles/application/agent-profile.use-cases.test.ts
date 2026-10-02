import { beforeEach, describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryUnitOfWork,
} from '../../../platform/testing/fakes.js';
import { createAccountsHarness } from '../../accounts/testing/accounts-harness.js';
import { sampleTaxonomySource } from '../../taxonomy/testing/sample-taxonomy.js';
import { AgentProfile, AgentProfileEvents } from '../domain/agent-profile.js';
import { InMemoryAgentProfileRepository } from '../testing/in-memory-agent-profile.repository.js';
import { UpdateMyAgentProfileHandler } from './agent-profile.use-cases.js';

describe('UpdateMyAgentProfileHandler', () => {
  let clock: FixedClock;
  let events: InMemoryEventRecorder;
  let accounts: ReturnType<typeof createAccountsHarness>;
  let profiles: InMemoryAgentProfileRepository;
  let handler: UpdateMyAgentProfileHandler;
  let agentId: string;

  beforeEach(async () => {
    clock = new FixedClock();
    events = new InMemoryEventRecorder();
    accounts = createAccountsHarness(events, clock);
    profiles = new InMemoryAgentProfileRepository(events);
    handler = new UpdateMyAgentProfileHandler(
      profiles,
      accounts.facade,
      sampleTaxonomySource,
      new InMemoryUnitOfWork(),
      clock,
    );
    agentId = await accounts.createAccount({ email: 'chidi.eze@example.com', role: 'agent' });
  });

  it('completes onboarding with agency, title, specializations and city', async () => {
    const result = await handler.execute({
      userId: agentId,
      expectedVersion: null,
      patch: {
        agencyName: 'Eko Talent Management',
        jobTitle: 'Football scout',
        specializationSlugs: ['sports'],
        citySlug: 'ng-lagos',
      },
    });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value).toMatchObject({
      isComplete: true,
      missing: [],
      specializations: [{ name: 'Sports' }],
      verified: false,
    });
    expect((await accounts.repository.findById(agentId))?.snapshot()).toMatchObject({
      status: 'active',
    });
    expect(events.ofType(AgentProfileEvents.Completed)).toHaveLength(1);
  });

  it('refuses unknown categories and keeps talent out', async () => {
    const talent = await accounts.createAccount({ email: 'ada@example.com', role: 'talent' });
    const unknown = await handler.execute({
      userId: agentId,
      expectedVersion: null,
      patch: { specializationSlugs: ['chess'] },
    });
    const asTalent = await handler.execute({
      userId: talent,
      expectedVersion: null,
      patch: { agencyName: 'Not an agency' },
    });
    expect(!unknown.ok && unknown.error.code).toBe('UNKNOWN_TAXONOMY');
    expect(!asTalent.ok && asTalent.error.code).toBe('WRONG_ROLE');
  });

  it('requires the current version once the profile exists', async () => {
    await handler.execute({
      userId: agentId,
      expectedVersion: null,
      patch: { agencyName: 'Eko Talent Management' },
    });
    const stale = await handler.execute({
      userId: agentId,
      expectedVersion: 3,
      patch: { jobTitle: 'Scout' },
    });
    expect(!stale.ok && stale.error.code).toBe('PRECONDITION_FAILED');
  });
});

describe('AgentProfile verification badge', () => {
  it('drops the badge when a verified agent renames the agency', () => {
    const now = new Date('2026-10-02T09:00:00.000Z');
    const profile = AgentProfile.restore({
      ...AgentProfile.start('agent-1', now).snapshot(),
      agencyName: 'Eko Talent',
      verifiedAt: now,
    });
    profile.apply({ jobTitle: 'Head scout' }, now);
    expect(profile.snapshot().verifiedAt).toEqual(now);
    profile.apply({ agencyName: 'Eko Sports Agency' }, now);
    expect(profile.snapshot().verifiedAt).toBeNull();
  });
});
