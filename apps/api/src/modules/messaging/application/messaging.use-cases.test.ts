import type { TalentCard } from '@rt/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryRateLimiter,
  InMemoryUnitOfWork,
} from '../../../platform/testing/fakes.js';
import { createAccountsHarness } from '../../accounts/testing/accounts-harness.js';
import { ConversationEvents } from '../domain/conversation.js';
import { InMemoryConversationRepository } from '../testing/in-memory-conversation.repository.js';
import {
  BlockConversationHandler,
  CONTACT_REQUEST_LIMIT,
  ConversationEvidence,
  ConversationViews,
  GetConversationQuery,
  ListConversationsQuery,
  ListMessagesQuery,
  MarkConversationReadHandler,
  MessagingExport,
  MessagingUnreadQuery,
  ConversationWithAgentQuery,
  ConversationWithTalentQuery,
  MessageTalentHandler,
  RequestContactHandler,
  TALENT_MESSAGE_LIMIT,
  SubmitToAgentHandler,
  RespondToContactHandler,
  SendMessageHandler,
  WithdrawContactHandler,
  type MessagingAccounts,
  type MessagingAgents,
  type MessagingTalents,
} from './messaging.use-cases.js';

const INTRO = 'Hello Ngozi, I scout singers for Eko Talent Partners and loved your Lekki showcase.';
const ids = {
  a: '0192a3b4-0000-7000-8000-00000000a001',
  b: '0192a3b4-0000-7000-8000-00000000a002',
  c: '0192a3b4-0000-7000-8000-00000000a003',
  d: '0192a3b4-0000-7000-8000-00000000a004',
};

class FakeTalents implements MessagingTalents {
  readonly visible = new Map<string, string>();
  readonly names = new Map<string, string>();
  async visibleUserId(handle: string) {
    return this.visible.get(handle) ?? null;
  }
  async cardFor(userId: string): Promise<TalentCard | null> {
    const handle = [...this.visible].find(([, id]) => id === userId)?.[0];
    return handle
      ? {
          handle,
          displayName: this.names.get(userId) ?? handle,
          category: { slug: 'music', name: 'Music' },
          subcategories: [],
          city: { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
          ageYears: 26,
          verified: false,
          avatarUrls: null,
        }
      : null;
  }
  async nameOf(userId: string) {
    const name = this.names.get(userId);
    return name ? { handle: name.toLowerCase(), displayName: name } : null;
  }
}

class FakeAgents implements MessagingAgents {
  readonly verified = new Set<string>();
  /** Agents talent can write to first. */
  readonly open = new Set<string>();
  async submissions(agentId: string) {
    if (!this.verified.has(agentId)) return null;
    return this.open.has(agentId) ? ('open' as const) : ('closed' as const);
  }
  async summaryOf(agentId: string) {
    return {
      agencyName: 'Eko Talent Partners',
      jobTitle: 'Talent scout',
      city: 'Lagos',
      verified: this.verified.has(agentId),
      specializations: ['Music'],
      website: 'https://eko-talent.example',
      verifiedAt: this.verified.has(agentId) ? new Date('2026-09-01T09:00:00.000Z') : null,
      memberSince: new Date('2026-08-01T09:00:00.000Z'),
    };
  }
}

describe('contact requests and chat (ADR-011, ADR-038)', () => {
  let clock: FixedClock;
  let events: InMemoryEventRecorder;
  let accounts: ReturnType<typeof createAccountsHarness>;
  let conversations: InMemoryConversationRepository;
  let talents: FakeTalents;
  let agents: FakeAgents;
  let limiter: InMemoryRateLimiter;
  let ask: RequestContactHandler;
  let submit: SubmitToAgentHandler;
  let withAgent: ConversationWithAgentQuery;
  let respond: RespondToContactHandler;
  let withdraw: WithdrawContactHandler;
  let send: SendMessageHandler;
  let list: ListConversationsQuery;
  let get: GetConversationQuery;
  let messages: ListMessagesQuery;
  let markRead: MarkConversationReadHandler;
  let unread: MessagingUnreadQuery;
  let exporter: MessagingExport;
  let blocking: BlockConversationHandler;
  let agentId: string;
  let talentId: string;

  beforeEach(async () => {
    clock = new FixedClock();
    events = new InMemoryEventRecorder();
    const uow = new InMemoryUnitOfWork();
    accounts = createAccountsHarness(events, clock);
    conversations = new InMemoryConversationRepository(events);
    talents = new FakeTalents();
    agents = new FakeAgents();
    limiter = new InMemoryRateLimiter();
    const views = new ConversationViews(conversations, accounts.facade, talents, agents);
    ask = new RequestContactHandler(
      conversations,
      views,
      accounts.facade,
      talents,
      agents,
      limiter,
      uow,
      clock,
    );
    submit = new SubmitToAgentHandler(
      conversations,
      views,
      accounts.facade,
      talents,
      agents,
      limiter,
      uow,
      clock,
    );
    withAgent = new ConversationWithAgentQuery(conversations, views, accounts.facade);
    respond = new RespondToContactHandler(conversations, views, uow, clock);
    withdraw = new WithdrawContactHandler(conversations, views, uow, clock);
    send = new SendMessageHandler(conversations, views, limiter, uow, clock);
    list = new ListConversationsQuery(conversations, views, accounts.facade);
    get = new GetConversationQuery(views);
    messages = new ListMessagesQuery(conversations, views);
    markRead = new MarkConversationReadHandler(conversations, views, uow, clock);
    unread = new MessagingUnreadQuery(conversations);
    exporter = new MessagingExport(conversations, views);
    blocking = new BlockConversationHandler(conversations, views, uow, clock);

    agentId = await accounts.createAccount({ email: 'tunde@eko-talent.example', role: 'agent' });
    await accounts.facade.completeOnboarding(agentId);
    agents.verified.add(agentId);
    talentId = await accounts.createAccount({ email: 'ngozi@example.com', role: 'talent' });
    await accounts.facade.completeOnboarding(talentId);
    talents.visible.set('ngozi', talentId);
    talents.names.set(talentId, 'Ngozi Adeyemi');
  });

  const request = (clientMessageId = ids.a, message = INTRO) =>
    ask.execute(agentId, 'ngozi', { message, clientMessageId });

  async function openChat(): Promise<string> {
    const asked = await request();
    if (!asked.ok) throw new Error(asked.error.message);
    const accepted = await respond.execute(talentId, asked.value.id, true);
    if (!accepted.ok) throw new Error(accepted.error.message);
    return asked.value.id;
  }

  it('lets a verified agent ask, and tells the talent', async () => {
    const asked = await request();
    expect(asked.ok && asked.value).toMatchObject({
      status: 'requested',
      counterpart: {
        kind: 'talent',
        handle: 'ngozi',
        displayName: 'Ngozi Adeyemi',
        available: true,
      },
      lastMessage: { mine: true, body: INTRO },
      canSend: false,
      awaitingMyAnswer: false,
    });
    expect(events.ofType(ConversationEvents.ContactRequested)).toHaveLength(1);

    const inbox = await list.execute(talentId);
    expect(inbox.ok && inbox.value.items[0]).toMatchObject({
      counterpart: {
        kind: 'agent',
        agencyName: 'Eko Talent Partners',
        verified: true,
        specializations: ['Music'],
        website: 'https://eko-talent.example',
        verifiedAt: '2026-09-01T09:00:00.000Z',
      },
      lastMessage: { mine: false, body: INTRO },
      unread: 1,
      awaitingMyAnswer: true,
    });
    expect(await unread.execute(talentId)).toEqual({ unread: 1 });
  });

  it('refuses anyone who is not an active, email-verified, verified agent', async () => {
    agents.verified.delete(agentId);
    const notVerified = await request();
    expect(notVerified.ok ? null : notVerified.error.code).toBe('AGENT_NOT_VERIFIED');

    const fresh = await accounts.createAccount({
      email: 'new@eko-talent.example',
      role: 'agent',
      verified: false,
    });
    await accounts.facade.completeOnboarding(fresh);
    agents.verified.add(fresh);
    const unverifiedEmail = await ask.execute(fresh, 'ngozi', {
      message: INTRO,
      clientMessageId: ids.b,
    });
    expect(unverifiedEmail.ok ? null : unverifiedEmail.error.code).toBe('EMAIL_NOT_VERIFIED');

    const asTalent = await ask.execute(talentId, 'ngozi', {
      message: INTRO,
      clientMessageId: ids.c,
    });
    expect(asTalent.ok ? null : asTalent.error.code).toBe('WRONG_ROLE');

    agents.verified.add(agentId);
    const hidden = await ask.execute(agentId, 'somebody-hidden', {
      message: INTRO,
      clientMessageId: ids.d,
    });
    expect(hidden.ok ? null : hidden.error.code).toBe('NOT_FOUND');
  });

  it('treats a retried request as the same request, and refuses a second one', async () => {
    const first = await request();
    const retry = await request();
    expect(retry.ok && first.ok && retry.value.id).toBe(first.ok && first.value.id);
    expect(conversations.messageRows).toHaveLength(1);
    const second = await request(ids.b);
    expect(second.ok ? null : second.error.code).toBe('CONTACT_REQUEST_PENDING');
  });

  it('opens chat when the talent accepts, and both can then send, safely retried', async () => {
    const id = await openChat();
    expect(events.ofType(ConversationEvents.ContactAccepted)).toHaveLength(1);
    clock.advanceSeconds(30);
    const reply = await send.execute(talentId, id, {
      body: 'Thank you! Happy to talk.',
      clientMessageId: ids.b,
    });
    const again = await send.execute(talentId, id, {
      body: 'Thank you! Happy to talk.',
      clientMessageId: ids.b,
    });
    expect(reply.ok && again.ok && reply.value.id === again.value.id).toBe(true);
    const forAgent = await get.execute(agentId, id);
    expect(forAgent.ok && forAgent.value).toMatchObject({
      status: 'accepted',
      canSend: true,
      unread: 1,
    });
    expect(await unread.execute(agentId)).toEqual({ unread: 1 });
    await markRead.execute(agentId, id);
    expect(await unread.execute(agentId)).toEqual({ unread: 0 });

    clock.advanceSeconds(30);
    await send.execute(agentId, id, { body: 'Can you send a voice note?', clientMessageId: ids.c });
    const page = await messages.execute(talentId, id);
    expect(page.ok && page.value.items.map((message) => [message.mine, message.body])).toEqual([
      [false, 'Can you send a voice note?'],
      [true, 'Thank you! Happy to talk.'],
      [false, INTRO],
    ]);
  });

  it('keeps chat closed until accepted, and after the talent is hidden', async () => {
    const asked = await request();
    const id = asked.ok ? asked.value.id : '';
    const early = await send.execute(agentId, id, { body: 'Hello?', clientMessageId: ids.b });
    expect(early.ok ? null : early.error.code).toBe('CONVERSATION_CLOSED');

    await respond.execute(talentId, id, true);
    talents.visible.delete('ngozi');
    const later = await send.execute(agentId, id, { body: 'Still there?', clientMessageId: ids.c });
    expect(later.ok ? null : later.error.code).toBe('CONVERSATION_CLOSED');
    const view = await get.execute(agentId, id);
    expect(view.ok && view.value.counterpart).toMatchObject({
      kind: 'talent',
      displayName: 'Ngozi Adeyemi',
      available: false,
    });
  });

  it('lets the talent decline, hides it from them, and makes the agent wait to ask again', async () => {
    const asked = await request();
    const id = asked.ok ? asked.value.id : '';
    const declined = await respond.execute(talentId, id, false);
    expect(declined.ok && declined.value.status).toBe('declined');
    expect(events.ofType(ConversationEvents.ContactDeclined)).toHaveLength(1);
    const talentList = await list.execute(talentId);
    expect(talentList.ok && talentList.value.items).toEqual([]);
    expect((await get.execute(talentId, id)).ok).toBe(false);

    const tooSoon = await request(ids.b);
    expect(tooSoon.ok ? null : [tooSoon.error.code, tooSoon.error.retryAfterSeconds]).toEqual([
      'CONTACT_DECLINED_RECENTLY',
      30 * 24 * 60 * 60,
    ]);
    clock.advanceDays(30);
    const again = await request(ids.c, `${INTRO} We now have a paid recording session.`);
    expect(again.ok && again.value).toMatchObject({ id, status: 'requested' });
  });

  it('lets the agent withdraw an unanswered request, and ask again at once', async () => {
    const asked = await request();
    const id = asked.ok ? asked.value.id : '';
    const withdrawn = await withdraw.execute(agentId, id);
    expect(withdrawn.ok && withdrawn.value.status).toBe('withdrawn');
    expect(await unread.execute(talentId)).toEqual({ unread: 0 });
    const answer = await respond.execute(talentId, id, true);
    expect(answer.ok ? null : answer.error.code).toBe('NOT_FOUND');
    expect((await request(ids.b)).ok).toBe(true);
  });

  it('keeps conversations private to the two people in them', async () => {
    const id = await openChat();
    const stranger = await accounts.createAccount({ email: 'other@example.com', role: 'talent' });
    expect((await get.execute(stranger, id)).ok).toBe(false);
    const sent = await send.execute(stranger, id, { body: 'Hi', clientMessageId: ids.d });
    expect(sent.ok ? null : sent.error.code).toBe('NOT_FOUND');
    const notTheirs = await respond.execute(agentId, id, true);
    expect(notTheirs.ok ? null : notTheirs.error.code).toBe('NOT_FOUND');
  });

  it('limits how many talent an agent can ask in a day', async () => {
    for (let n = 0; n < CONTACT_REQUEST_LIMIT.perDay; n += 1) {
      await limiter.consume(`contact-request:${agentId}`, 1000, 1);
    }
    const limited = await request();
    expect(limited.ok ? null : limited.error.code).toBe('RATE_LIMITED');
  });

  it("exports the person's own messages and only counts the other side's", async () => {
    const id = await openChat();
    await send.execute(talentId, id, { body: 'Happy to talk.', clientMessageId: ids.b });
    expect(await exporter.forUser(talentId)).toEqual([
      {
        with: 'Eko Talent Partners',
        status: 'accepted',
        requestedAt: '2026-10-01T09:00:00.000Z',
        messagesFromOthers: 1,
        myMessages: [{ body: 'Happy to talk.', sentAt: '2026-10-01T09:00:00.000Z' }],
      },
    ]);
  });

  it("gives a report the other person's latest messages, and nothing to outsiders (ADR-039)", async () => {
    const id = await openChat();
    clock.advanceSeconds(10);
    await send.execute(talentId, id, { body: 'Who is the client?', clientMessageId: ids.b });
    const evidence = new ConversationEvidence(conversations);
    expect(await evidence.forReport(id, talentId)).toEqual({
      subjectId: agentId,
      evidence: [{ body: INTRO, sentAt: new Date('2026-10-01T09:00:00.000Z') }],
    });
    const stranger = await accounts.createAccount({ email: 'x@example.com', role: 'talent' });
    expect(await evidence.forReport(id, stranger)).toBeNull();
  });

  it('lets a talent block an agent mid-chat: nobody can write, and only they can undo it (ADR-040)', async () => {
    const id = await openChat();
    const blocked = await blocking.execute(talentId, id, true);
    expect(blocked.ok && blocked.value).toMatchObject({ blockedByMe: true, canSend: false });
    const forAgent = await get.execute(agentId, id);
    expect(forAgent.ok && forAgent.value).toMatchObject({ blockedByMe: false, canSend: false });
    const sent = await send.execute(agentId, id, { body: 'Hello?', clientMessageId: ids.b });
    expect(sent.ok ? null : sent.error.code).toBe('CONVERSATION_CLOSED');
    const agentUnblock = await blocking.execute(agentId, id, false);
    expect(agentUnblock.ok ? null : agentUnblock.error.code).toBe('NOT_FOUND');

    const unblocked = await blocking.execute(talentId, id, false);
    expect(unblocked.ok && unblocked.value).toMatchObject({ blockedByMe: false, canSend: true });
  });

  it('declines a request the talent blocks, keeps it in their list, and stops the agent asking again', async () => {
    const asked = await request();
    const id = asked.ok ? asked.value.id : '';
    const blocked = await blocking.execute(talentId, id, true);
    expect(blocked.ok && blocked.value).toMatchObject({ status: 'declined', blockedByMe: true });
    expect(events.ofType(ConversationEvents.ContactDeclined)).toHaveLength(1);
    expect(await unread.execute(talentId)).toEqual({ unread: 0 });
    const list1 = await list.execute(talentId);
    expect(list1.ok && list1.value.items.map((item) => item.id)).toEqual([id]);

    clock.advanceDays(31);
    const again = await request(ids.b);
    // The same answer a recent decline gives: the agent is not told about the block.
    expect(again.ok ? null : again.error.code).toBe('CONTACT_DECLINED_RECENTLY');
  });

  it('withdraws a request the agent blocks, so the talent stops seeing it', async () => {
    const asked = await request();
    const id = asked.ok ? asked.value.id : '';
    const blocked = await blocking.execute(agentId, id, true);
    expect(blocked.ok && blocked.value).toMatchObject({ status: 'withdrawn', blockedByMe: true });
    expect((await get.execute(talentId, id)).ok).toBe(false);
    expect(await unread.execute(talentId)).toEqual({ unread: 0 });
  });

  describe('submissions: a talent writes first (ADR-050)', () => {
    const SUBMISSION =
      'Hello, I am a singer from Lagos with two EPs out. I would love you to hear my latest set.';
    const apply = (clientMessageId = ids.a) =>
      submit.execute(talentId, agentId, { message: SUBMISSION, clientMessageId });

    beforeEach(() => {
      agents.open.add(agentId);
    });

    it('lets a talent write to an open agent, who is the one to answer', async () => {
      const sent = await apply();
      expect(sent.ok && sent.value).toMatchObject({
        status: 'requested',
        counterpart: { kind: 'agent', agencyName: 'Eko Talent Partners' },
        requestedByMe: true,
        awaitingMyAnswer: false,
        canSend: false,
      });
      const id = sent.ok ? sent.value.id : '';
      expect(events.ofType(ConversationEvents.ContactRequested)[0]?.payload).toMatchObject({
        requestedBy: 'talent',
      });
      // The agent has something to answer; the talent does not.
      expect(await unread.execute(agentId)).toEqual({ unread: 1 });
      expect(await unread.execute(talentId)).toEqual({ unread: 0 });
      const forAgent = await get.execute(agentId, id);
      expect(forAgent.ok && forAgent.value).toMatchObject({
        awaitingMyAnswer: true,
        requestedByMe: false,
        counterpart: { kind: 'talent', displayName: 'Ngozi Adeyemi' },
      });
      // The talent cannot accept their own submission.
      const self = await respond.execute(talentId, id, true);
      expect(self.ok ? null : self.error.code).toBe('NOT_FOUND');

      const accepted = await respond.execute(agentId, id, true);
      expect(accepted.ok && accepted.value).toMatchObject({ status: 'accepted', canSend: true });
      const reply = await send.execute(talentId, id, {
        body: 'Thank you!',
        clientMessageId: ids.b,
      });
      expect(reply.ok).toBe(true);
      const found = await withAgent.execute(talentId, agentId);
      expect(found.ok && found.value.id).toBe(id);
    });

    it('is safe to retry, and says so when one is already waiting', async () => {
      const first = await apply();
      const retry = await apply();
      expect(retry.ok && first.ok && retry.value.id).toBe(first.ok ? first.value.id : '');
      const second = await apply(ids.b);
      expect(second.ok ? null : second.error.code).toBe('CONTACT_REQUEST_PENDING');
    });

    it('refuses agents who are not open, not listed, or already asking', async () => {
      agents.open.delete(agentId);
      const closed = await apply();
      expect(closed.ok ? null : [closed.error.code, closed.error.message]).toEqual([
        'FORBIDDEN',
        'This agent is not open for submissions right now. Save them and check back later.',
      ]);

      agents.verified.delete(agentId);
      const unlisted = await apply();
      expect(unlisted.ok ? null : unlisted.error.code).toBe('NOT_FOUND');

      agents.verified.add(agentId);
      agents.open.add(agentId);
      await request(ids.c);
      const crossed = await apply(ids.b);
      expect(crossed.ok ? null : crossed.error.code).toBe('CONFLICT');
    });

    it('keeps it to talent whose profile others can see', async () => {
      const asAgent = await submit.execute(agentId, agentId, {
        message: SUBMISSION,
        clientMessageId: ids.a,
      });
      expect(asAgent.ok ? null : asAgent.error.code).toBe('WRONG_ROLE');
      talents.visible.delete('ngozi');
      const hidden = await apply();
      expect(hidden.ok ? null : hidden.error.code).toBe('FORBIDDEN');
    });

    it('makes a declined talent wait, but lets the agent reach out at once', async () => {
      const sent = await apply();
      const id = sent.ok ? sent.value.id : '';
      const declined = await respond.execute(agentId, id, false);
      expect(declined.ok && declined.value.status).toBe('declined');
      // The agent no longer sees what they declined; the talent still sees their own.
      expect((await get.execute(agentId, id)).ok).toBe(false);
      expect((await get.execute(talentId, id)).ok).toBe(true);

      const tooSoon = await apply(ids.b);
      expect(tooSoon.ok ? null : tooSoon.error.code).toBe('CONTACT_DECLINED_RECENTLY');
      // The agent changed their mind: that is their call to make.
      const reachedOut = await request(ids.c);
      expect(reachedOut.ok && reachedOut.value).toMatchObject({
        id,
        status: 'requested',
        requestedByMe: true,
      });
      expect(await unread.execute(talentId)).toEqual({ unread: 1 });
    });

    it('lets the talent take a submission back, and limits how many go out in a day', async () => {
      const sent = await apply();
      const id = sent.ok ? sent.value.id : '';
      const byAgent = await withdraw.execute(agentId, id);
      expect(byAgent.ok ? null : byAgent.error.code).toBe('NOT_FOUND');
      const withdrawn = await withdraw.execute(talentId, id);
      expect(withdrawn.ok && withdrawn.value.status).toBe('withdrawn');
      expect(await unread.execute(agentId)).toEqual({ unread: 0 });

      for (let n = 0; n < 4; n += 1) {
        const other = await accounts.createAccount({
          email: `agent${String(n)}@x.example`,
          role: 'agent',
        });
        agents.verified.add(other);
        agents.open.add(other);
        const ok = await submit.execute(talentId, other, {
          message: SUBMISSION,
          clientMessageId: `0192a3b4-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`,
        });
        expect(ok.ok).toBe(true);
      }
      const sixth = await apply(ids.b);
      expect(sixth.ok ? null : sixth.error.code).toBe('RATE_LIMITED');
    });
  });
  describe('between two talent (ADR-061)', () => {
    const HELLO = 'Hi Ngozi, I produce music videos in Lagos. Would you sing on my next one?';
    let contact: RequestContactHandler;
    let withTalent: ConversationWithTalentQuery;
    let tobiId: string;
    /** Ages set by the test; everyone else is the harness's adult. */
    const ages = new Map<string, number>();
    const withAges: MessagingAccounts = {
      profileContext: async (userId) => {
        const context = await accounts.facade.profileContext(userId);
        const age = ages.get(userId);
        return context && age !== undefined ? { ...context, ageYears: age } : context;
      },
    };

    beforeEach(async () => {
      ages.clear();
      const uow = new InMemoryUnitOfWork();
      const views = new ConversationViews(conversations, withAges, talents, agents);
      const peers = new MessageTalentHandler(
        conversations,
        views,
        withAges,
        talents,
        limiter,
        uow,
        clock,
      );
      // The same address agents use: a talent's request goes to the peer handler.
      contact = new RequestContactHandler(
        conversations,
        views,
        withAges,
        talents,
        agents,
        limiter,
        uow,
        clock,
        peers,
      );
      withTalent = new ConversationWithTalentQuery(conversations, views, withAges, talents);
      tobiId = await addTalent('tobi', 'Tobi Adewale');
    });

    async function addTalent(handle: string, name: string, age?: number) {
      const id = await accounts.createAccount({ email: `${handle}@example.com`, role: 'talent' });
      await accounts.facade.completeOnboarding(id);
      if (age !== undefined) ages.set(id, age);
      talents.visible.set(handle, id);
      talents.names.set(id, name);
      return id;
    }

    const write = (from: string, to: string, clientMessageId = ids.c, message = HELLO) =>
      contact.execute(from, to, { message, clientMessageId });

    it('lets one talent ask another, and opens a chat when they accept', async () => {
      const asked = await write(tobiId, 'ngozi');
      if (!asked.ok) throw new Error(asked.error.message);
      expect(asked.value).toMatchObject({
        status: 'requested',
        counterpart: { kind: 'talent', handle: 'ngozi', displayName: 'Ngozi Adeyemi' },
        requestedByMe: true,
        canSend: false,
      });
      const [requested] = events.ofType(ConversationEvents.ContactRequested);
      expect(requested?.payload).toMatchObject({ kind: 'peer' });

      // Ngozi sees Tobi, as a talent, waiting for her answer.
      const inbox = await list.execute(talentId);
      expect(inbox.ok && inbox.value.items[0]).toMatchObject({
        counterpart: { kind: 'talent', handle: 'tobi', displayName: 'Tobi Adewale' },
        awaitingMyAnswer: true,
      });
      expect(await unread.execute(talentId)).toEqual({ unread: 1 });
      // Only the one asked can answer.
      const byTobi = await respond.execute(tobiId, asked.value.id, true);
      expect(byTobi.ok ? null : byTobi.error.code).toBe('NOT_FOUND');

      const accepted = await respond.execute(talentId, asked.value.id, true);
      expect(accepted.ok && accepted.value).toMatchObject({ status: 'accepted', canSend: true });
      const reply = await send.execute(talentId, asked.value.id, {
        body: 'Yes, tell me more.',
        clientMessageId: ids.d,
      });
      expect(reply.ok && reply.value.mine).toBe(true);
      const thread = await messages.execute(tobiId, asked.value.id);
      expect(thread.ok && thread.value.items.map((message) => message.body)).toEqual([
        'Yes, tell me more.',
        HELLO,
      ]);
      const found = await withTalent.execute(talentId, 'tobi');
      expect(found.ok && found.value.id).toBe(asked.value.id);
    });

    it('keeps one conversation per pair, whoever asks', async () => {
      const asked = await write(tobiId, 'ngozi');
      const again = await write(tobiId, 'ngozi', ids.d);
      expect(again.ok ? null : again.error.code).toBe('CONTACT_REQUEST_PENDING');
      const fromNgozi = await write(talentId, 'tobi', ids.d);
      expect(fromNgozi.ok ? null : fromNgozi.error.message).toMatch(/already asked to contact you/);
      // A retry of the first request answers with the same conversation.
      const retried = await write(tobiId, 'ngozi');
      expect(retried.ok && asked.ok && retried.value.id).toBe(asked.ok && asked.value.id);
      expect(conversations.rows.size).toBe(1);
    });

    it('keeps under-18s and adults apart, both ways', async () => {
      const teenId = await addTalent('kemi', 'Kemi Bello', 16);
      const toTeen = await write(tobiId, 'kemi');
      expect(toTeen.ok ? null : toTeen.error.code).toBe('FORBIDDEN');
      const fromTeen = await write(teenId, 'ngozi');
      expect(fromTeen.ok ? null : fromTeen.error.code).toBe('FORBIDDEN');
      // The profile page asks first, and offers nothing to send.
      const lookup = await withTalent.execute(tobiId, 'kemi');
      expect(lookup.ok ? null : lookup.error.code).toBe('FORBIDDEN');

      await addTalent('dayo', 'Dayo Bello', 15);
      // Eighteen is an adult: the line sits at the birthday.
      await addTalent('femi', 'Femi Bello', 18);
      const adults = await write(tobiId, 'femi');
      expect(adults.ok).toBe(true);
      const teens = await write(teenId, 'dayo');
      expect(teens.ok && teens.value.status).toBe('requested');
      expect(conversations.rows.size).toBe(2);
    });

    it('asks the writer for a verified email and a profile others can see', async () => {
      const unverified = await accounts.createAccount({
        email: 'new@example.com',
        role: 'talent',
        verified: false,
      });
      await accounts.facade.completeOnboarding(unverified);
      talents.visible.set('new', unverified);
      const noEmail = await write(unverified, 'ngozi');
      expect(noEmail.ok ? null : noEmail.error.code).toBe('EMAIL_NOT_VERIFIED');

      talents.visible.delete('tobi');
      const hidden = await write(tobiId, 'ngozi');
      expect(hidden.ok ? null : hidden.error.code).toBe('FORBIDDEN');
      talents.visible.set('tobi', tobiId);

      const self = await write(tobiId, 'tobi');
      expect(self.ok ? null : self.error.code).toBe('CONFLICT');
      const nobody = await write(tobiId, 'nobody');
      expect(nobody.ok ? null : nobody.error.code).toBe('NOT_FOUND');
    });

    it('limits how many conversations a talent starts in a day', async () => {
      for (let n = 0; n < TALENT_MESSAGE_LIMIT.perDay; n += 1) {
        await addTalent(`singer${String(n)}`, `Singer ${String(n)}`);
        const ok = await write(
          tobiId,
          `singer${String(n)}`,
          `0192a3b4-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
        );
        expect(ok.ok).toBe(true);
      }
      const over = await write(tobiId, 'ngozi');
      expect(over.ok ? null : over.error.code).toBe('RATE_LIMITED');
    });
  });
});
