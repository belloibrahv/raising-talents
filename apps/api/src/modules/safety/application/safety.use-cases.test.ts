import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryRateLimiter,
  InMemoryUnitOfWork,
} from '../../../platform/testing/fakes.js';
import { AccountEvents } from '../../accounts/domain/account.events.js';
import { createAccountsHarness } from '../../accounts/testing/accounts-harness.js';
import { InMemoryReportRepository } from '../testing/in-memory-report.repository.js';
import {
  DecideReportsHandler,
  FileReportHandler,
  ListReportedAccountsQuery,
  ReinstateAccountHandler,
  type SafetyTalents,
} from './safety.use-cases.js';

describe('Reports and enforcement', () => {
  let clock: FixedClock;
  let events: InMemoryEventRecorder;
  let accounts: ReturnType<typeof createAccountsHarness>;
  let reports: InMemoryReportRepository;
  let file: FileReportHandler;
  let list: ListReportedAccountsQuery;
  let decide: DecideReportsHandler;
  let reinstate: ReinstateAccountHandler;
  let talentId: string;
  let agentId: string;
  let otherAgentId: string;
  let moderatorId: string;
  let signedOut: string[];

  const activeMember = async (email: string, role: 'talent' | 'agent') => {
    const id = await accounts.createAccount({ email, role });
    await accounts.facade.completeOnboarding(id);
    return id;
  };

  const report = (reporterId: string, note?: string) =>
    file.execute(reporterId, {
      subject: { kind: 'talent', handle: 'tobi.adewale' },
      category: 'scam_or_harassment',
      note,
    });

  beforeEach(async () => {
    clock = new FixedClock();
    events = new InMemoryEventRecorder();
    accounts = createAccountsHarness(events, clock);
    reports = new InMemoryReportRepository();
    signedOut = [];
    talentId = await activeMember('tobi.adewale@example.com', 'talent');
    agentId = await activeMember('scout.one@example.com', 'agent');
    otherAgentId = await activeMember('scout.two@example.com', 'agent');
    moderatorId = await accounts.createAccount({ email: 'mod@raisingtalents.app', role: null });
    await accounts.facade.grantStaffRole('mod@raisingtalents.app', 'moderator');

    const talents: SafetyTalents = {
      visibleUserId: async (handle) => {
        const context = await accounts.facade.profileContext(talentId);
        return handle === 'tobi.adewale' && context?.status === 'active' ? talentId : null;
      },
      searchable: (userId) =>
        Promise.resolve(
          userId === talentId
            ? { profile: { handle: 'tobi.adewale', displayName: 'Tobi Adewale' } }
            : null,
        ),
    };
    const uow = new InMemoryUnitOfWork();
    file = new FileReportHandler(
      reports,
      accounts.facade,
      talents,
      new InMemoryRateLimiter(),
      clock,
    );
    list = new ListReportedAccountsQuery(reports, accounts.facade, talents);
    decide = new DecideReportsHandler(
      reports,
      accounts.facade,
      { signOutBlocked: (userId) => Promise.resolve(void signedOut.push(userId)) },
      uow,
      clock,
      pino({ level: 'silent' }),
    );
    reinstate = new ReinstateAccountHandler(reports, accounts.facade, uow, clock);
    events.events.length = 0;
  });

  it('groups open reports by account, without saying who reported', async () => {
    expect((await report(agentId, 'Asked me for a registration fee')).ok).toBe(true);
    clock.advanceSeconds(60);
    expect((await report(otherAgentId)).ok).toBe(true);
    expect((await report(agentId, 'Second try')).ok).toBe(true);

    const queue = await list.execute(moderatorId);
    expect(queue.ok && queue.value).toEqual({
      items: [
        {
          accountId: talentId,
          role: 'talent',
          status: 'active',
          talent: { handle: 'tobi.adewale', displayName: 'Tobi Adewale' },
          openReports: 2,
          categories: [{ category: 'scam_or_harassment', count: 2 }],
          notes: [
            { note: 'Asked me for a registration fee', reportedAt: expect.any(String) as string },
          ],
          firstReportedAt: expect.any(String) as string,
          previousActions: 0,
        },
      ],
      nextCursor: null,
    });
    expect(JSON.stringify(queue)).not.toContain(agentId);
  });

  it('refuses reports on yourself, on unknown profiles, and from unverified accounts', async () => {
    const own = await report(talentId);
    expect(own.ok ? null : own.error.code).toBe('FORBIDDEN');
    const unknown = await file.execute(agentId, {
      subject: { kind: 'talent', handle: 'nobody.here' },
      category: 'other',
    });
    expect(unknown.ok ? null : unknown.error.code).toBe('NOT_FOUND');
    const unverified = await accounts.createAccount({ email: 'new@example.com', verified: false });
    const early = await report(unverified);
    expect(early.ok ? null : early.error.code).toBe('FORBIDDEN');
  });

  it('suspends the account, closes its reports and keeps the record', async () => {
    await report(agentId);
    const decided = await decide.execute({
      moderatorId,
      accountId: talentId,
      decision: { decision: 'suspend', reason: 'scam_or_harassment' },
    });
    expect(decided.ok).toBe(true);
    expect((await accounts.facade.profileContext(talentId))?.status).toBe('suspended');
    expect(events.events.map((event) => [event.type, event.payload])).toEqual([
      [AccountEvents.AccountSuspended, { reason: 'scam_or_harassment' }],
    ]);
    expect(reports.reports[0]).toMatchObject({ status: 'actioned', closedBy: moderatorId });
    expect(reports.actions).toMatchObject([{ action: 'suspend', actorId: moderatorId }]);
    expect(signedOut).toEqual([talentId]);
    const queue = await list.execute(moderatorId);
    expect(queue.ok && queue.value.items).toEqual([]);

    // Hidden now, so nobody can report the profile while it is suspended.
    const later = await report(otherAgentId);
    expect(later.ok ? null : later.error.code).toBe('NOT_FOUND');
  });

  it('dismisses without touching the account, and a second decision finds nothing open', async () => {
    await report(agentId);
    expect(
      (
        await decide.execute({
          moderatorId,
          accountId: talentId,
          decision: { decision: 'dismiss' },
        })
      ).ok,
    ).toBe(true);
    expect((await accounts.facade.profileContext(talentId))?.status).toBe('active');
    expect(signedOut).toEqual([]);
    const twice = await decide.execute({
      moderatorId,
      accountId: talentId,
      decision: { decision: 'ban', reason: 'other' },
    });
    expect(twice.ok ? null : twice.error.code).toBe('NOT_FOUND');
    expect((await accounts.facade.profileContext(talentId))?.status).toBe('active');
  });

  it('keeps members out of the queue and decisions', async () => {
    await report(agentId);
    const asMember = await list.execute(agentId);
    const decideAsMember = await decide.execute({
      moderatorId: agentId,
      accountId: talentId,
      decision: { decision: 'ban', reason: 'other' },
    });
    expect(asMember.ok ? null : asMember.error.code).toBe('FORBIDDEN');
    expect(decideAsMember.ok ? null : decideAsMember.error.code).toBe('FORBIDDEN');
  });

  it('lets an operator reinstate, records it, and counts earlier restrictions', async () => {
    await report(agentId);
    await decide.execute({
      moderatorId,
      accountId: talentId,
      decision: { decision: 'ban', reason: 'fake_or_impersonation' },
    });
    const notStaff = await reinstate.execute({
      email: 'tobi.adewale@example.com',
      operatorEmail: 'scout.one@example.com',
    });
    expect(notStaff.ok ? null : notStaff.error.code).toBe('FORBIDDEN');
    const done = await reinstate.execute({
      email: 'tobi.adewale@example.com',
      operatorEmail: 'mod@raisingtalents.app',
    });
    expect(done.ok && done.value).toBe(talentId);
    expect((await accounts.facade.profileContext(talentId))?.status).toBe('active');
    expect(reports.actions.map((entry) => entry.action)).toEqual(['ban', 'reinstate']);

    await report(otherAgentId);
    const queue = await list.execute(moderatorId);
    expect(queue.ok && queue.value.items[0]?.previousActions).toBe(1);
  });

  it('limits how many reports one person sends in a day', async () => {
    for (let n = 0; n < 10; n += 1) await report(agentId);
    const eleventh = await report(agentId);
    expect(eleventh.ok ? null : eleventh.error.code).toBe('RATE_LIMITED');
  });
});
