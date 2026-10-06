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
  RequestContactHandler,
  RespondToContactHandler,
  SendMessageHandler,
  WithdrawContactHandler,
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
});
