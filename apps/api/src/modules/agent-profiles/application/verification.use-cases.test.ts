import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryRateLimiter,
  InMemoryUnitOfWork,
} from '../../../platform/testing/fakes.js';
import { createAccountsHarness } from '../../accounts/testing/accounts-harness.js';
import { sampleTaxonomySource } from '../../taxonomy/testing/sample-taxonomy.js';
import { AgentProfile } from '../domain/agent-profile.js';
import { InMemoryAgentProfileRepository } from '../testing/in-memory-agent-profile.repository.js';
import { InMemoryVerificationRequestRepository } from '../testing/in-memory-verification-request.repository.js';
import {
  DecideVerificationHandler,
  GetMyVerificationQuery,
  ListPendingVerificationsQuery,
  RequestVerificationHandler,
} from './verification.use-cases.js';

const EVIDENCE = {
  evidenceUrl: 'https://eko-talent.example/team',
  registrationNumber: 'RC 1234567',
  note: 'Scout since 2019.',
};

describe('Agent verification', () => {
  let clock: FixedClock;
  let accounts: ReturnType<typeof createAccountsHarness>;
  let profiles: InMemoryAgentProfileRepository;
  let requests: InMemoryVerificationRequestRepository;
  let getMine: GetMyVerificationQuery;
  let ask: RequestVerificationHandler;
  let list: ListPendingVerificationsQuery;
  let decide: DecideVerificationHandler;
  let agentId: string;
  let moderatorId: string;

  async function completeProfile(userId: string, agencyName = 'Eko Talent Partners') {
    const profile = AgentProfile.start(userId, clock.now());
    profile.apply(
      {
        agencyName,
        jobTitle: 'Talent scout',
        specializationSlugs: ['music'],
        citySlug: 'ng-lagos',
      },
      clock.now(),
    );
    await profiles.save(profile);
    await accounts.facade.completeOnboarding(userId);
  }

  beforeEach(async () => {
    clock = new FixedClock();
    const events = new InMemoryEventRecorder();
    const uow = new InMemoryUnitOfWork();
    accounts = createAccountsHarness(events, clock);
    profiles = new InMemoryAgentProfileRepository(events);
    requests = new InMemoryVerificationRequestRepository(events);
    getMine = new GetMyVerificationQuery(profiles, requests, accounts.facade);
    ask = new RequestVerificationHandler(
      profiles,
      requests,
      accounts.facade,
      new InMemoryRateLimiter(),
      uow,
      clock,
    );
    list = new ListPendingVerificationsQuery(
      profiles,
      requests,
      accounts.facade,
      sampleTaxonomySource,
    );
    decide = new DecideVerificationHandler(
      profiles,
      requests,
      accounts.facade,
      uow,
      clock,
      pino({ level: 'silent' }),
    );
    agentId = await accounts.createAccount({
      email: 'tunde.bakare@eko-talent.example',
      role: 'agent',
    });
    moderatorId = await accounts.createAccount({
      email: 'moderator@raisingtalents.app',
      role: null,
    });
    await accounts.facade.grantStaffRole('moderator@raisingtalents.app', 'moderator');
  });

  it('cannot be requested before the agency profile is complete', async () => {
    const early = await ask.execute(agentId, EVIDENCE);
    expect(early.ok ? null : early.error.code).toBe('AGENT_PROFILE_INCOMPLETE');
    const view = await getMine.execute(agentId);
    expect(view.ok && view.value).toEqual({
      state: 'not_requested',
      declineReason: null,
      submittedAt: null,
      canRequest: false,
    });
  });

  it('goes from request to a moderator to a verified badge', async () => {
    await completeProfile(agentId);
    const asked = await ask.execute(agentId, EVIDENCE);
    expect(asked.ok && asked.value).toMatchObject({ state: 'pending', canRequest: false });
    const again = await ask.execute(agentId, EVIDENCE);
    expect(again.ok ? null : again.error.code).toBe('VERIFICATION_PENDING');

    const queue = await list.execute(moderatorId);
    if (!queue.ok) throw new Error(queue.error.message);
    expect(queue.value.items[0]).toMatchObject({
      agentId,
      email: 'tunde.bakare@eko-talent.example',
      agencyName: 'Eko Talent Partners',
      city: { slug: 'ng-lagos', name: 'Lagos' },
      specializations: [{ slug: 'music', name: 'Music' }],
      evidenceUrl: 'https://eko-talent.example/team',
      registrationNumber: 'RC 1234567',
      previouslyDeclined: 0,
    });

    const requestId = queue.value.items[0]?.id ?? '';
    expect(
      (await decide.execute({ moderatorId, requestId, decision: { decision: 'approve' } })).ok,
    ).toBe(true);
    expect((await profiles.findByUserId(agentId))?.isVerified).toBe(true);
    const view = await getMine.execute(agentId);
    expect(view.ok && view.value.state).toBe('verified');
    const twice = await decide.execute({
      moderatorId,
      requestId,
      decision: { decision: 'approve' },
    });
    expect(twice.ok ? null : twice.error.code).toBe('CONFLICT');
    const afterVerified = await ask.execute(agentId, EVIDENCE);
    expect(afterVerified.ok ? null : afterVerified.error.code).toBe('ALREADY_VERIFIED');
    expect(requests.rows.get(requestId)).toMatchObject({
      status: 'approved',
      decidedBy: moderatorId,
    });
  });

  it('tells a declined agent why, lets them try again, and shows moderators the history', async () => {
    await completeProfile(agentId);
    await ask.execute(agentId, EVIDENCE);
    const first = [...requests.rows.keys()][0] ?? '';
    await decide.execute({
      moderatorId,
      requestId: first,
      decision: { decision: 'decline', category: 'evidence_unreachable' },
    });

    const view = await getMine.execute(agentId);
    expect(view.ok && view.value).toMatchObject({
      state: 'declined',
      declineReason: 'We could not open the page you sent. Check the address and try again.',
      canRequest: true,
    });
    clock.advanceSeconds(60);
    expect(
      (await ask.execute(agentId, { evidenceUrl: 'https://eko-talent.example/about' })).ok,
    ).toBe(true);
    const queue = await list.execute(moderatorId);
    expect(queue.ok && queue.value.items[0]?.previouslyDeclined).toBe(1);
  });

  it('removes the badge when the agency is renamed, so the new name is checked', async () => {
    await completeProfile(agentId);
    await ask.execute(agentId, EVIDENCE);
    await decide.execute({
      moderatorId,
      requestId: [...requests.rows.keys()][0] ?? '',
      decision: { decision: 'approve' },
    });
    const profile = await profiles.findByUserId(agentId);
    profile?.apply({ agencyName: 'Lagos Stars Management' }, clock.now());
    if (profile) await profiles.save(profile);
    const view = await getMine.execute(agentId);
    expect(view.ok && view.value).toMatchObject({ state: 'not_requested', canRequest: true });
  });

  it('keeps everyone but staff out of the queue and decisions, and limits requests a day', async () => {
    await completeProfile(agentId);
    const asAgent = await list.execute(agentId);
    expect(asAgent.ok ? null : asAgent.error.code).toBe('FORBIDDEN');

    for (let n = 0; n < 3; n += 1) {
      await ask.execute(agentId, EVIDENCE);
      const id = [...requests.rows.values()].find((row) => row.status === 'pending')?.id ?? '';
      const declinedByAgent = await decide.execute({
        moderatorId: agentId,
        requestId: id,
        decision: { decision: 'approve' },
      });
      expect(declinedByAgent.ok ? null : declinedByAgent.error.code).toBe('FORBIDDEN');
      await decide.execute({
        moderatorId,
        requestId: id,
        decision: { decision: 'decline', category: 'other' },
      });
    }
    const fourth = await ask.execute(agentId, EVIDENCE);
    expect(fourth.ok ? null : fourth.error.code).toBe('RATE_LIMITED');
  });
});
