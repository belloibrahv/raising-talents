import {
  ADULT_AGE_YEARS,
  REPORT_EVIDENCE_MAX,
  CONVERSATIONS_PAGE_SIZE,
  MESSAGES_PAGE_SIZE,
  SUBMISSIONS_PER_DAY,
  TALENT_MESSAGE_REQUESTS_PER_DAY,
  type AccountStatus,
  type ConversationPage,
  type ConversationSummary,
  type Counterpart,
  type DataExport,
  type Message,
  type MessagePage,
  type MessagingUnread,
  type RequestContact,
  type Role,
  type SendMessage,
  type TalentCard,
} from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import { decodeCursor, encodeCursor } from '../../../platform/cursor.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import { newId } from '../../../platform/ids.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import type { Realtime } from '../../../platform/realtime/realtime.js';
import {
  Conversation,
  ConversationExistsError,
  DuplicateMessageError,
  MessagingErrors,
  peerPlaces,
  type ConversationKind,
  type ConversationRepository,
  type StoredMessage,
} from '../domain/conversation.js';

export const MESSAGING = {
  Conversations: Symbol('ConversationRepository'),
  RequestContact: Symbol('RequestContactHandler'),
  MessageTalent: Symbol('MessageTalentHandler'),
  Submit: Symbol('SubmitToAgentHandler'),
  WithTalent: Symbol('ConversationWithTalentQuery'),
  WithAgent: Symbol('ConversationWithAgentQuery'),
  List: Symbol('ListConversationsQuery'),
  Get: Symbol('GetConversationQuery'),
  Messages: Symbol('ListMessagesQuery'),
  Send: Symbol('SendMessageHandler'),
  Respond: Symbol('RespondToContactHandler'),
  Withdraw: Symbol('WithdrawContactHandler'),
  MarkRead: Symbol('MarkConversationReadHandler'),
  Unread: Symbol('MessagingUnreadQuery'),
  Export: Symbol('MessagingExport'),
  Notices: Symbol('ContactNotices'),
  Evidence: Symbol('ConversationEvidence'),
  Block: Symbol('BlockConversationHandler'),
  Live: Symbol('ConversationLive'),
  Unblock: Symbol('UnblockConversationHandler'),
} as const;

/** Provisional (ADR-038): generous for real scouting, tight enough to stop a mass mailing. */
export const CONTACT_REQUEST_LIMIT = { perDay: 20, windowSeconds: 24 * 60 * 60 } as const;
/** Provisional (ADR-050): enough to approach the agents that fit, not to write to them all. */
export const SUBMISSION_LIMIT = {
  perDay: SUBMISSIONS_PER_DAY,
  windowSeconds: 24 * 60 * 60,
} as const;
export const MESSAGE_LIMIT = { perHour: 120, windowSeconds: 60 * 60 } as const;
/** Provisional (ADR-061): enough to reach people to work with, not to write to everyone. */
export const TALENT_MESSAGE_LIMIT = {
  perDay: TALENT_MESSAGE_REQUESTS_PER_DAY,
  windowSeconds: 24 * 60 * 60,
} as const;

/** Under-18s and adults stay apart in messages between talent (ADR-059, ADR-061). */
function sameAgeGroup(one: number | null, other: number | null): boolean {
  if (one === null || other === null) return false;
  return one >= ADULT_AGE_YEARS === other >= ADULT_AGE_YEARS;
}

/** What messaging needs from accounts. Implemented by AccountsFacade. */
export interface MessagingAccounts {
  profileContext(userId: string): Promise<{
    role: Role | null;
    status: AccountStatus;
    emailVerified: boolean;
    ageYears: number | null;
  } | null>;
}

/** What messaging needs from talent profiles. Implemented by TalentDirectory. */
export interface MessagingTalents {
  visibleUserId(handle: string): Promise<string | null>;
  cardFor(userId: string): Promise<TalentCard | null>;
  nameOf(userId: string): Promise<{ handle: string; displayName: string } | null>;
}

/** What messaging needs from agent profiles. Implemented by AgentDirectory. */
export interface MessagingAgents {
  summaryOf(agentId: string): Promise<{
    agencyName: string;
    jobTitle: string;
    city: string | null;
    verified: boolean;
    specializations: string[];
    website: string | null;
    verifiedAt: Date | null;
    memberSince: Date;
  } | null>;
  /**
   * Whether talent can write to this agent first: open, closed, or null when the agent is
   * not one talent can find at all (unverified, unfinished or not in good standing).
   */
  submissions(agentId: string): Promise<'open' | 'closed' | null>;
}

const toMessage = (message: StoredMessage, viewerId: string): Message => ({
  id: message.id,
  mine: message.senderId === viewerId,
  body: message.body,
  sentAt: message.sentAt.toISOString(),
});

/** Builds what one person sees of a conversation. Shared by every query and command. */
export class ConversationViews {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly accounts: MessagingAccounts,
    private readonly talents: MessagingTalents,
    private readonly agents: MessagingAgents,
  ) {}

  /** The talent as the agent sees them; marked unavailable while the profile is hidden. */
  async talentCounterpart(talentId: string): Promise<Counterpart & { kind: 'talent' }> {
    const card = await this.talents.cardFor(talentId);
    if (card) {
      return {
        kind: 'talent',
        handle: card.handle,
        displayName: card.displayName,
        avatarUrls: card.avatarUrls,
        available: true,
      };
    }
    const name = await this.talents.nameOf(talentId);
    return {
      kind: 'talent',
      handle: name?.handle ?? '',
      displayName: name?.displayName ?? 'Talent',
      avatarUrls: null,
      available: false,
    };
  }

  async agentCounterpart(agentId: string): Promise<Counterpart & { kind: 'agent' }> {
    const summary = await this.agents.summaryOf(agentId);
    return {
      kind: 'agent',
      agencyName: summary?.agencyName ?? 'An agency',
      jobTitle: summary?.jobTitle ?? '',
      city: summary?.city ?? null,
      verified: summary?.verified ?? false,
      specializations: summary?.specializations ?? [],
      website: summary?.website ?? null,
      verifiedAt: summary?.verifiedAt?.toISOString() ?? null,
      memberSince: (summary?.memberSince ?? new Date(0)).toISOString(),
    };
  }

  /** Who the viewer is talking to: the other talent in a peer conversation. */
  async counterpartFor(conversation: Conversation, viewerId: string): Promise<Counterpart> {
    if (conversation.kind === 'peer') {
      return this.talentCounterpart(conversation.otherThan(viewerId));
    }
    return conversation.sideOf(viewerId) === 'agent'
      ? this.talentCounterpart(conversation.talentId)
      : this.agentCounterpart(conversation.agentId);
  }

  /**
   * Chat stays open while both accounts are active and the talent is visible. Between two
   * talent, both must be visible (ADR-061).
   */
  async canSend(conversation: Conversation): Promise<boolean> {
    if (conversation.status !== 'accepted' || conversation.isBlocked) return false;
    if (conversation.kind === 'peer') {
      const cards = await Promise.all([
        this.talents.cardFor(conversation.agentId),
        this.talents.cardFor(conversation.talentId),
      ]);
      return cards.every((card) => card !== null);
    }
    const [agent, talentCard] = await Promise.all([
      this.accounts.profileContext(conversation.agentId),
      this.talents.cardFor(conversation.talentId),
    ]);
    return agent?.status === 'active' && talentCard !== null;
  }

  async summary(conversation: Conversation, viewerId: string): Promise<ConversationSummary> {
    const props = conversation.snapshot();
    const [counterpart, [last], unread, canSend] = await Promise.all([
      this.counterpartFor(conversation, viewerId),
      this.conversations.messages(props.id, null, 1),
      this.conversations.countUnread(props.id, viewerId, conversation.readAtFor(viewerId)),
      this.canSend(conversation),
    ]);
    return {
      id: props.id,
      kind: props.kind,
      status: props.status,
      counterpart,
      lastMessage: last ? toMessage(last, viewerId) : null,
      unread,
      canSend,
      awaitingMyAnswer:
        conversation.responderId === viewerId &&
        props.status === 'requested' &&
        !conversation.isBlocked,
      requestedByMe: conversation.askedBy(viewerId),
      blockedByMe: conversation.blockedBy(viewerId),
      requestedAt: props.requestedAt.toISOString(),
      updatedAt: props.updatedAt.toISOString(),
    };
  }

  /** The conversation when the user is in it. Anyone else gets the same 404 as a missing one. */
  async find(
    conversationId: string,
    userId: string,
    options?: { lock?: boolean },
  ): Promise<Conversation | null> {
    const conversation = await this.conversations.findById(conversationId, options);
    if (!conversation?.sideOf(userId)) return null;
    // The person who was asked no longer sees a request that was withdrawn, or that they
    // declined, unless they blocked the other and may want to undo it.
    if (
      conversation.responderId === userId &&
      (conversation.status === 'withdrawn' || conversation.status === 'declined') &&
      !conversation.blockedBy(userId)
    ) {
      return null;
    }
    return conversation;
  }
}

/**
 * A verified agent asks to contact a talent, with an introduction (ADR-011). The same address
 * from a talent is a message to another talent, handled by MessageTalentHandler (ADR-061).
 */
export class RequestContactHandler {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
    private readonly accounts: MessagingAccounts,
    private readonly talents: MessagingTalents,
    private readonly agents: MessagingAgents,
    private readonly rateLimiter: RateLimiter,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly peers: MessageTalentHandler | null = null,
  ) {}

  async execute(
    agentId: string,
    handle: string,
    input: RequestContact,
  ): Promise<Result<ConversationSummary, DomainError>> {
    const account = await this.accounts.profileContext(agentId);
    if (account?.role === 'talent' && this.peers) return this.peers.execute(agentId, handle, input);
    if (account?.role !== 'agent') return err(MessagingErrors.wrongRole());
    if (account.status !== 'active') return err(MessagingErrors.notActive());
    if (!account.emailVerified) return err(MessagingErrors.emailNotVerified());
    if (!(await this.agents.summaryOf(agentId))?.verified) {
      return err(MessagingErrors.agentNotVerified());
    }
    const talentId = await this.talents.visibleUserId(handle);
    if (!talentId) return err(MessagingErrors.talentNotFound());

    const existing = await this.conversations.findByPair(agentId, talentId);
    // A retry of a request that already went through answers with what it made.
    if (
      existing &&
      (await this.conversations.findMessage(existing.id, agentId, input.clientMessageId))
    ) {
      return ok(await this.views.summary(existing, agentId));
    }
    if (existing?.status === 'requested') {
      return err(
        existing.askedBy(agentId) ? MessagingErrors.pending() : MessagingErrors.waitingForYou(),
      );
    }
    if (existing?.status === 'accepted') return err(MessagingErrors.alreadyConnected());

    const limit = await this.rateLimiter.consume(
      `contact-request:${agentId}`,
      CONTACT_REQUEST_LIMIT.perDay,
      CONTACT_REQUEST_LIMIT.windowSeconds,
    );
    if (!limit.allowed) {
      return err(
        domainError(
          'RATE_LIMITED',
          'You have sent a lot of requests today. Try again tomorrow.',
          limit.retryAfterSeconds,
        ),
      );
    }

    const now = this.clock.now();
    try {
      const result = await this.uow.run(async () => {
        const locked = existing
          ? await this.conversations.findByPair(agentId, talentId, { lock: true })
          : null;
        const conversation =
          locked ?? Conversation.request({ id: newId(), agentId, talentId, now });
        if (locked) {
          const reopened = locked.requestAgain('agent', now);
          if (!reopened.ok) return reopened;
        }
        await this.conversations.save(conversation);
        await this.conversations.addMessage({
          id: newId(),
          conversationId: conversation.id,
          senderId: agentId,
          body: input.message.trim(),
          clientMessageId: input.clientMessageId,
          sentAt: now,
        });
        return ok(conversation);
      });
      if (!result.ok) return result;
      return ok(await this.views.summary(result.value, agentId));
    } catch (error) {
      // Two first requests raced; the database keeps one conversation per pair.
      if (error instanceof ConversationExistsError) return err(MessagingErrors.pending());
      throw error;
    }
  }
}

/**
 * One talent writes to another (ADR-061). The same request as an agent's: the other talent
 * accepts or declines, and chat opens only if they accept. Both must be in the same age
 * group, so under-18s and adults never write to each other this way.
 */
export class MessageTalentHandler {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
    private readonly accounts: MessagingAccounts,
    private readonly talents: MessagingTalents,
    private readonly rateLimiter: RateLimiter,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(
    senderId: string,
    handle: string,
    input: RequestContact,
  ): Promise<Result<ConversationSummary, DomainError>> {
    const sender = await this.accounts.profileContext(senderId);
    if (sender?.role !== 'talent') return err(MessagingErrors.wrongRole());
    if (!sender.emailVerified) return err(MessagingErrors.peerEmailNotVerified());
    // The other talent will open the profile first: it has to be one others can see.
    if (sender.status !== 'active' || !(await this.talents.cardFor(senderId))) {
      return err(MessagingErrors.peerNotVisible());
    }
    const recipientId = await this.talents.visibleUserId(handle);
    if (!recipientId) return err(MessagingErrors.talentNotFound());
    if (recipientId === senderId) return err(MessagingErrors.notYourself());
    const recipient = await this.accounts.profileContext(recipientId);
    if (!sameAgeGroup(sender.ageYears, recipient?.ageYears ?? null)) {
      return err(MessagingErrors.otherAgeGroup());
    }

    const places = peerPlaces(senderId, recipientId);
    const asking = places.agentId === senderId ? 'agent' : 'talent';
    const existing = await this.conversations.findByPair(places.agentId, places.talentId);
    // A retry of a request that already went through answers with what it made.
    if (
      existing &&
      (await this.conversations.findMessage(existing.id, senderId, input.clientMessageId))
    ) {
      return ok(await this.views.summary(existing, senderId));
    }
    if (existing?.status === 'requested') {
      return err(
        existing.askedBy(senderId) ? MessagingErrors.pending() : MessagingErrors.waitingForYou(),
      );
    }
    if (existing?.status === 'accepted') return err(MessagingErrors.alreadyConnected());

    const limit = await this.rateLimiter.consume(
      `talent-message:${senderId}`,
      TALENT_MESSAGE_LIMIT.perDay,
      TALENT_MESSAGE_LIMIT.windowSeconds,
    );
    if (!limit.allowed) {
      return err(
        domainError(
          'RATE_LIMITED',
          `You can start ${String(TALENT_MESSAGE_LIMIT.perDay)} conversations a day. Try again tomorrow.`,
          limit.retryAfterSeconds,
        ),
      );
    }

    const now = this.clock.now();
    try {
      const result = await this.uow.run(async () => {
        const locked = existing
          ? await this.conversations.findByPair(places.agentId, places.talentId, { lock: true })
          : null;
        const conversation =
          locked ??
          Conversation.request({
            id: newId(),
            kind: 'peer',
            ...places,
            requestedBy: asking,
            now,
          });
        if (locked) {
          const reopened = locked.requestAgain(asking, now);
          if (!reopened.ok) return reopened;
        }
        await this.conversations.save(conversation);
        await this.conversations.addMessage({
          id: newId(),
          conversationId: conversation.id,
          senderId,
          body: input.message.trim(),
          clientMessageId: input.clientMessageId,
          sentAt: now,
        });
        return ok(conversation);
      });
      if (!result.ok) return result;
      return ok(await this.views.summary(result.value, senderId));
    } catch (error) {
      // The other talent asked at the same moment; the database keeps one per pair.
      if (error instanceof ConversationExistsError) return err(MessagingErrors.waitingForYou());
      throw error;
    }
  }
}

/**
 * A talent introduces themselves to an agent who is open for submissions (ADR-050). It is
 * the same conversation as a contact request, asked from the other side: the agent accepts
 * or declines, and chat opens only if they accept.
 */
export class SubmitToAgentHandler {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
    private readonly accounts: MessagingAccounts,
    private readonly talents: MessagingTalents,
    private readonly agents: MessagingAgents,
    private readonly rateLimiter: RateLimiter,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(
    talentId: string,
    agentId: string,
    input: RequestContact,
  ): Promise<Result<ConversationSummary, DomainError>> {
    const account = await this.accounts.profileContext(talentId);
    if (account?.role !== 'talent') return err(MessagingErrors.talentOnly());
    if (!account.emailVerified) return err(MessagingErrors.talentEmailNotVerified());
    // An agent will open the profile first: it has to be one others can see.
    if (account.status !== 'active' || !(await this.talents.cardFor(talentId))) {
      return err(MessagingErrors.talentNotVisible());
    }
    const taking = await this.agents.submissions(agentId);
    if (!taking) return err(MessagingErrors.agentNotFound());

    const existing = await this.conversations.findByPair(agentId, talentId);
    // A retry of a submission that already went through answers with what it made.
    if (
      existing &&
      (await this.conversations.findMessage(existing.id, talentId, input.clientMessageId))
    ) {
      return ok(await this.views.summary(existing, talentId));
    }
    if (existing?.status === 'requested') {
      return err(
        existing.askedBy(talentId) ? MessagingErrors.pending() : MessagingErrors.waitingForYou(),
      );
    }
    if (existing?.status === 'accepted') return err(MessagingErrors.alreadyConnected());
    if (taking !== 'open') return err(MessagingErrors.notTakingSubmissions());

    const limit = await this.rateLimiter.consume(
      `submission:${talentId}`,
      SUBMISSION_LIMIT.perDay,
      SUBMISSION_LIMIT.windowSeconds,
    );
    if (!limit.allowed) {
      return err(
        domainError(
          'RATE_LIMITED',
          `You can send ${String(SUBMISSION_LIMIT.perDay)} submissions a day. Try again tomorrow.`,
          limit.retryAfterSeconds,
        ),
      );
    }

    const now = this.clock.now();
    try {
      const result = await this.uow.run(async () => {
        const locked = existing
          ? await this.conversations.findByPair(agentId, talentId, { lock: true })
          : null;
        const conversation =
          locked ??
          Conversation.request({ id: newId(), agentId, talentId, requestedBy: 'talent', now });
        if (locked) {
          const reopened = locked.requestAgain('talent', now);
          if (!reopened.ok) return reopened;
        }
        await this.conversations.save(conversation);
        await this.conversations.addMessage({
          id: newId(),
          conversationId: conversation.id,
          senderId: talentId,
          body: input.message.trim(),
          clientMessageId: input.clientMessageId,
          sentAt: now,
        });
        return ok(conversation);
      });
      if (!result.ok) return result;
      return ok(await this.views.summary(result.value, talentId));
    } catch (error) {
      // The agent asked at the same moment; the database keeps one conversation per pair.
      if (error instanceof ConversationExistsError) return err(MessagingErrors.waitingForYou());
      throw error;
    }
  }
}

/** Lets an agent's page show the talent their submission or chat with that agent. */
export class ConversationWithAgentQuery {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
    private readonly accounts: MessagingAccounts,
  ) {}

  async execute(
    talentId: string,
    agentId: string,
  ): Promise<Result<ConversationSummary, DomainError>> {
    const account = await this.accounts.profileContext(talentId);
    if (account?.role !== 'talent') return err(MessagingErrors.talentOnly());
    const pair = await this.conversations.findByPair(agentId, talentId);
    // The same rule as the list: a request the talent declined is not shown to them again.
    const conversation = pair ? await this.views.find(pair.id, talentId) : null;
    return conversation
      ? ok(await this.views.summary(conversation, talentId))
      : err(MessagingErrors.notFound());
  }
}

/**
 * Lets the talent's profile page show the viewer's request or chat with them: an agent's, or
 * another talent's (ADR-061). A talent in the other age group gets Forbidden, so the page
 * offers nothing to send.
 */
export class ConversationWithTalentQuery {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
    private readonly accounts: MessagingAccounts,
    private readonly talents: MessagingTalents,
  ) {}

  async execute(
    agentId: string,
    handle: string,
  ): Promise<Result<ConversationSummary, DomainError>> {
    const account = await this.accounts.profileContext(agentId);
    if (account?.role === 'talent') return this.betweenTalent(agentId, account.ageYears, handle);
    if (account?.role !== 'agent') return err(MessagingErrors.wrongRole());
    const talentId = await this.talents.visibleUserId(handle);
    const conversation = talentId ? await this.conversations.findByPair(agentId, talentId) : null;
    return conversation
      ? ok(await this.views.summary(conversation, agentId))
      : err(MessagingErrors.notFound());
  }

  private async betweenTalent(
    viewerId: string,
    viewerAge: number | null,
    handle: string,
  ): Promise<Result<ConversationSummary, DomainError>> {
    const otherId = await this.talents.visibleUserId(handle);
    if (!otherId || otherId === viewerId) return err(MessagingErrors.notFound());
    const other = await this.accounts.profileContext(otherId);
    if (!sameAgeGroup(viewerAge, other?.ageYears ?? null)) {
      return err(MessagingErrors.otherAgeGroup());
    }
    const places = peerPlaces(viewerId, otherId);
    const pair = await this.conversations.findByPair(places.agentId, places.talentId);
    // The same rule as the list: a request they declined is not shown to them again.
    const conversation = pair ? await this.views.find(pair.id, viewerId) : null;
    return conversation
      ? ok(await this.views.summary(conversation, viewerId))
      : err(MessagingErrors.notFound());
  }
}

export class ListConversationsQuery {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
    private readonly accounts: MessagingAccounts,
  ) {}

  async execute(userId: string, cursor?: string): Promise<Result<ConversationPage, DomainError>> {
    const account = await this.accounts.profileContext(userId);
    if (account?.role !== 'agent' && account?.role !== 'talent') {
      return err(domainError('WRONG_ROLE', 'Only talent and agents have conversations.'));
    }
    const after = decodeCursor(cursor);
    const rows = await this.conversations.pageFor(
      userId,
      after ? { updatedAt: after.at, id: after.id } : null,
      CONVERSATIONS_PAGE_SIZE + 1,
    );
    const page = rows.slice(0, CONVERSATIONS_PAGE_SIZE);
    const last = page.at(-1)?.snapshot();
    return ok({
      items: await Promise.all(page.map((row) => this.views.summary(row, userId))),
      nextCursor:
        rows.length > CONVERSATIONS_PAGE_SIZE && last
          ? encodeCursor(last.updatedAt, last.id)
          : null,
    });
  }
}

export class GetConversationQuery {
  constructor(private readonly views: ConversationViews) {}

  async execute(
    userId: string,
    conversationId: string,
  ): Promise<Result<ConversationSummary, DomainError>> {
    const conversation = await this.views.find(conversationId, userId);
    return conversation
      ? ok(await this.views.summary(conversation, userId))
      : err(MessagingErrors.notFound());
  }
}

export class ListMessagesQuery {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
  ) {}

  async execute(
    userId: string,
    conversationId: string,
    cursor?: string,
  ): Promise<Result<MessagePage, DomainError>> {
    const conversation = await this.views.find(conversationId, userId);
    if (!conversation) return err(MessagingErrors.notFound());
    const after = decodeCursor(cursor);
    const rows = await this.conversations.messages(
      conversation.id,
      after ? { sentAt: after.at, id: after.id } : null,
      MESSAGES_PAGE_SIZE + 1,
    );
    const page = rows.slice(0, MESSAGES_PAGE_SIZE);
    const last = page.at(-1);
    return ok({
      items: page.map((message) => toMessage(message, userId)),
      nextCursor:
        rows.length > MESSAGES_PAGE_SIZE && last ? encodeCursor(last.sentAt, last.id) : null,
    });
  }
}

/** Writes over REST, safe to retry (ADR-009). */
export class SendMessageHandler {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
    private readonly rateLimiter: RateLimiter,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    conversationId: string,
    input: SendMessage,
  ): Promise<Result<Message, DomainError>> {
    const conversation = await this.views.find(conversationId, userId);
    if (!conversation) return err(MessagingErrors.notFound());
    const sent = await this.conversations.findMessage(
      conversation.id,
      userId,
      input.clientMessageId,
    );
    if (sent) return ok(toMessage(sent, userId));
    if (!(await this.views.canSend(conversation))) return err(MessagingErrors.closed());

    const limit = await this.rateLimiter.consume(
      `message:${userId}`,
      MESSAGE_LIMIT.perHour,
      MESSAGE_LIMIT.windowSeconds,
    );
    if (!limit.allowed) {
      return err(
        domainError(
          'RATE_LIMITED',
          'You are sending messages very quickly. Wait a little and try again.',
          limit.retryAfterSeconds,
        ),
      );
    }
    const message: StoredMessage = {
      id: newId(),
      conversationId: conversation.id,
      senderId: userId,
      body: input.body.trim(),
      clientMessageId: input.clientMessageId,
      sentAt: this.clock.now(),
    };
    try {
      const result = await this.uow.run(async () => {
        const locked = await this.conversations.findById(conversation.id, { lock: true });
        if (locked?.status !== 'accepted' || locked.isBlocked) return err(MessagingErrors.closed());
        await this.conversations.addMessage(message);
        locked.messageSent(userId, message.sentAt);
        await this.conversations.save(locked);
        return ok(undefined);
      });
      return result.ok ? ok(toMessage(message, userId)) : result;
    } catch (error) {
      if (!(error instanceof DuplicateMessageError)) throw error;
      // A retry stored the same message a moment ago: answer with that one.
      const stored = await this.conversations.findMessage(
        conversation.id,
        userId,
        input.clientMessageId,
      );
      if (!stored) throw error;
      return ok(toMessage(stored, userId));
    }
  }
}

export class RespondToContactHandler {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /** Only the person who was asked can answer: a talent for a request, an agent for a submission. */
  async execute(
    talentId: string,
    conversationId: string,
    accept: boolean,
  ): Promise<Result<ConversationSummary, DomainError>> {
    const result = await this.uow.run(async () => {
      const conversation = await this.views.find(conversationId, talentId, { lock: true });
      if (conversation?.responderId !== talentId) return err(MessagingErrors.notFound());
      const answered = conversation.respond(accept, this.clock.now());
      if (!answered.ok) return answered;
      await this.conversations.save(conversation);
      return ok(conversation);
    });
    if (!result.ok) return result;
    return ok(await this.views.summary(result.value, talentId));
  }
}

export class WithdrawContactHandler {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(
    agentId: string,
    conversationId: string,
  ): Promise<Result<ConversationSummary, DomainError>> {
    const result = await this.uow.run(async () => {
      const conversation = await this.views.find(conversationId, agentId, { lock: true });
      // Only the person who asked can take it back.
      if (conversation?.requesterId !== agentId) return err(MessagingErrors.notFound());
      const withdrawn = conversation.withdraw(this.clock.now());
      if (!withdrawn.ok) return withdrawn;
      await this.conversations.save(conversation);
      return ok(conversation);
    });
    if (!result.ok) return result;
    return ok(await this.views.summary(result.value, agentId));
  }
}

/** Either person stops the other from writing; only they can undo it (ADR-040). */
export class BlockConversationHandler {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    conversationId: string,
    block: boolean,
  ): Promise<Result<ConversationSummary, DomainError>> {
    const result = await this.uow.run(async () => {
      const conversation = await this.views.find(conversationId, userId, { lock: true });
      if (!conversation) return err(MessagingErrors.notFound());
      const changed = block
        ? conversation.block(userId, this.clock.now())
        : conversation.unblock(userId);
      if (!changed.ok) return changed;
      await this.conversations.save(conversation);
      return ok(conversation);
    });
    if (!result.ok) return result;
    return ok(await this.views.summary(result.value, userId));
  }
}

export class MarkConversationReadHandler {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, conversationId: string): Promise<Result<void, DomainError>> {
    return this.uow.run(async () => {
      const conversation = await this.views.find(conversationId, userId, { lock: true });
      if (!conversation) return err(MessagingErrors.notFound());
      conversation.markRead(userId, this.clock.now());
      await this.conversations.save(conversation);
      return ok(undefined);
    });
  }
}

export class MessagingUnreadQuery {
  constructor(private readonly conversations: ConversationRepository) {}

  async execute(userId: string): Promise<MessagingUnread> {
    return { unread: await this.conversations.countNeedingAttention(userId) };
  }
}

/** The person's own side of every conversation, for their data export (ADR-027). */
export class MessagingExport {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
  ) {}

  async forUser(userId: string): Promise<DataExport['conversations']> {
    const all = await this.conversations.allFor(userId);
    return Promise.all(
      all.map(async (conversation) => {
        const props = conversation.snapshot();
        const [counterpart, mine, fromOthers] = await Promise.all([
          this.views.counterpartFor(conversation, userId),
          this.conversations.messagesBy(userId, props.id),
          this.conversations.countFromOthers(props.id, userId),
        ]);
        return {
          with: counterpart.kind === 'talent' ? counterpart.displayName : counterpart.agencyName,
          status: props.status,
          requestedAt: props.requestedAt.toISOString(),
          messagesFromOthers: fromOthers,
          myMessages: mine.map((message) => ({
            body: message.body,
            sentAt: message.sentAt.toISOString(),
          })),
        };
      }),
    );
  }
}

/** Read by notifications to word a notice about a request or an answer. */
export class ContactNotices {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly views: ConversationViews,
  ) {}

  async describe(conversationId: string): Promise<{
    kind: ConversationKind;
    agentId: string;
    talentId: string;
    status: string;
    requestedBy: 'agent' | 'talent';
    agencyName: string;
    talentName: string;
    /** Between two talent: who asked and who answers, with their names (ADR-061). */
    requesterId: string;
    responderId: string;
    requesterName: string;
    responderName: string;
  } | null> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation) return null;
    if (conversation.kind === 'peer') {
      const [requester, responder] = await Promise.all([
        this.views.talentCounterpart(conversation.requesterId),
        this.views.talentCounterpart(conversation.responderId),
      ]);
      return {
        kind: 'peer',
        agentId: conversation.agentId,
        talentId: conversation.talentId,
        status: conversation.status,
        requestedBy: conversation.snapshot().requestedBy,
        agencyName: '',
        talentName: '',
        requesterId: conversation.requesterId,
        responderId: conversation.responderId,
        requesterName: requester.displayName,
        responderName: responder.displayName,
      };
    }
    const [agent, talent] = await Promise.all([
      this.views.agentCounterpart(conversation.agentId),
      this.views.talentCounterpart(conversation.talentId),
    ]);
    const agentAsked = conversation.snapshot().requestedBy === 'agent';
    return {
      kind: 'agent',
      requesterId: conversation.requesterId,
      responderId: conversation.responderId,
      requesterName: agentAsked ? agent.agencyName : talent.displayName,
      responderName: agentAsked ? talent.displayName : agent.agencyName,
      agentId: conversation.agentId,
      talentId: conversation.talentId,
      status: conversation.status,
      requestedBy: conversation.snapshot().requestedBy,
      agencyName: agent.agencyName,
      talentName: talent.displayName,
    };
  }
}

/**
 * For a report from inside a conversation: who is reported, and what they wrote there
 * (ADR-039). Moderators see only the reported person's own messages, never the reporter's.
 */
export class ConversationEvidence {
  constructor(private readonly conversations: ConversationRepository) {}

  async forReport(
    conversationId: string,
    reporterId: string,
  ): Promise<{ subjectId: string; evidence: { body: string; sentAt: Date }[] } | null> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation?.sideOf(reporterId)) return null;
    const subjectId = conversation.otherThan(reporterId);
    const theirs = await this.conversations.messagesBy(subjectId, conversation.id);
    return {
      subjectId,
      evidence: theirs
        .slice(-REPORT_EVIDENCE_MAX)
        .map((message) => ({ body: message.body, sentAt: message.sentAt })),
    };
  }
}

/** Tells both people's open tabs that a conversation changed, after the write committed. */
export class ConversationLive {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly realtime: Realtime,
  ) {}

  async changed(conversationId: string): Promise<void> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation) return;
    await this.realtime.publish([conversation.agentId, conversation.talentId], {
      type: 'conversation',
      conversationId,
    });
  }
}
