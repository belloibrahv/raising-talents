import {
  REPORT_EVIDENCE_MAX,
  CONVERSATIONS_PAGE_SIZE,
  MESSAGES_PAGE_SIZE,
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
import {
  Conversation,
  ConversationExistsError,
  DuplicateMessageError,
  MessagingErrors,
  type ConversationRepository,
  type StoredMessage,
} from '../domain/conversation.js';

export const MESSAGING = {
  Conversations: Symbol('ConversationRepository'),
  RequestContact: Symbol('RequestContactHandler'),
  WithTalent: Symbol('ConversationWithTalentQuery'),
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
  Unblock: Symbol('UnblockConversationHandler'),
} as const;

/** Provisional (ADR-038): generous for real scouting, tight enough to stop a mass mailing. */
export const CONTACT_REQUEST_LIMIT = { perDay: 20, windowSeconds: 24 * 60 * 60 } as const;
export const MESSAGE_LIMIT = { perHour: 120, windowSeconds: 60 * 60 } as const;

/** What messaging needs from accounts. Implemented by AccountsFacade. */
export interface MessagingAccounts {
  profileContext(userId: string): Promise<{
    role: Role | null;
    status: AccountStatus;
    emailVerified: boolean;
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
  } | null>;
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
    };
  }

  /** Chat stays open while both accounts are active and the talent is visible. */
  async canSend(conversation: Conversation): Promise<boolean> {
    if (conversation.status !== 'accepted' || conversation.isBlocked) return false;
    const [agent, talentCard] = await Promise.all([
      this.accounts.profileContext(conversation.agentId),
      this.talents.cardFor(conversation.talentId),
    ]);
    return agent?.status === 'active' && talentCard !== null;
  }

  async summary(conversation: Conversation, viewerId: string): Promise<ConversationSummary> {
    const side = conversation.sideOf(viewerId);
    const props = conversation.snapshot();
    const [counterpart, [last], unread, canSend] = await Promise.all([
      side === 'agent'
        ? this.talentCounterpart(props.talentId)
        : this.agentCounterpart(props.agentId),
      this.conversations.messages(props.id, null, 1),
      this.conversations.countUnread(props.id, viewerId, conversation.readAtFor(viewerId)),
      this.canSend(conversation),
    ]);
    return {
      id: props.id,
      status: props.status,
      counterpart,
      lastMessage: last ? toMessage(last, viewerId) : null,
      unread,
      canSend,
      awaitingMyAnswer:
        side === 'talent' && props.status === 'requested' && !conversation.isBlocked,
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
    // A talent no longer sees a request that was withdrawn, or that they declined, unless
    // they blocked the agent and may want to undo it.
    if (
      conversation.sideOf(userId) === 'talent' &&
      (conversation.status === 'withdrawn' || conversation.status === 'declined') &&
      !conversation.blockedBy(userId)
    ) {
      return null;
    }
    return conversation;
  }
}

/** A verified agent asks to contact a talent, with an introduction (ADR-011). */
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
  ) {}

  async execute(
    agentId: string,
    handle: string,
    input: RequestContact,
  ): Promise<Result<ConversationSummary, DomainError>> {
    const account = await this.accounts.profileContext(agentId);
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
    if (existing?.status === 'requested') return err(MessagingErrors.pending());
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
          const reopened = locked.requestAgain(now);
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

/** Lets the talent's profile page show the agent's request or chat with them. */
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
    if (account?.role !== 'agent') return err(MessagingErrors.wrongRole());
    const talentId = await this.talents.visibleUserId(handle);
    const conversation = talentId ? await this.conversations.findByPair(agentId, talentId) : null;
    return conversation
      ? ok(await this.views.summary(conversation, agentId))
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

  async execute(
    talentId: string,
    conversationId: string,
    accept: boolean,
  ): Promise<Result<ConversationSummary, DomainError>> {
    const result = await this.uow.run(async () => {
      const conversation = await this.views.find(conversationId, talentId, { lock: true });
      if (conversation?.sideOf(talentId) !== 'talent') return err(MessagingErrors.notFound());
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
      if (conversation?.sideOf(agentId) !== 'agent') return err(MessagingErrors.notFound());
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
        const side = conversation.sideOf(userId);
        const [counterpart, mine, fromOthers] = await Promise.all([
          side === 'agent'
            ? this.views.talentCounterpart(props.talentId)
            : this.views.agentCounterpart(props.agentId),
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
    agentId: string;
    talentId: string;
    status: string;
    agencyName: string;
    talentName: string;
  } | null> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation) return null;
    const [agent, talent] = await Promise.all([
      this.views.agentCounterpart(conversation.agentId),
      this.views.talentCounterpart(conversation.talentId),
    ]);
    return {
      agentId: conversation.agentId,
      talentId: conversation.talentId,
      status: conversation.status,
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
