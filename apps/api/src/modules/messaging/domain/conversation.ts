import { CONTACT_DECLINE_COOLDOWN_DAYS, ErrorCode, type ConversationStatus } from '@rt/contracts';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import { err, ok, type Result } from '../../../platform/result.js';

export const ConversationEvents = {
  ContactRequested: 'messaging.ContactRequested',
  ContactAccepted: 'messaging.ContactAccepted',
  ContactDeclined: 'messaging.ContactDeclined',
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export const MessagingErrors = {
  notFound: () => domainError(ErrorCode.NotFound, 'This conversation does not exist.'),
  talentNotFound: () => domainError(ErrorCode.NotFound, 'This profile is not available.'),
  wrongRole: () =>
    domainError(ErrorCode.WrongRole, 'Only agents and scouts can ask to contact talent.'),
  notActive: () =>
    domainError(ErrorCode.Forbidden, 'Finish setting up your agency profile to contact talent.'),
  emailNotVerified: () =>
    domainError(ErrorCode.EmailNotVerified, 'Verify your email before you contact talent.'),
  agentNotVerified: () =>
    domainError(
      ErrorCode.AgentNotVerified,
      'Only verified agencies can contact talent. Ask us to verify your agency first.',
    ),
  pending: () =>
    domainError(
      ErrorCode.ContactRequestPending,
      'You have already asked. The talent has not answered yet.',
    ),
  declinedRecently: (retryAfterSeconds: number) =>
    domainError(
      ErrorCode.ContactDeclinedRecently,
      'This talent declined your request recently. You can ask again later.',
      retryAfterSeconds,
    ),
  alreadyConnected: () =>
    domainError(ErrorCode.Conflict, 'You are already in touch. Open the conversation.'),
  notRequested: () =>
    domainError(ErrorCode.Conflict, 'This request has already been answered or withdrawn.'),
  closed: () =>
    domainError(
      ErrorCode.ConversationClosed,
      'This conversation is closed. Messages can be sent once a request is accepted, while both accounts are active.',
    ),
};

export interface ConversationProps {
  readonly id: string;
  readonly agentId: string;
  readonly talentId: string;
  readonly status: ConversationStatus;
  readonly requestedAt: Date;
  readonly respondedAt: Date | null;
  /** The latest message or answer, for ordering the list. */
  readonly updatedAt: Date;
  readonly agentReadAt: Date | null;
  readonly talentReadAt: Date | null;
}

/**
 * One agent and one talent. It starts as a contact request whose first message is the
 * agent's introduction, and becomes a chat when the talent accepts (ADR-011, ADR-038).
 * A pair only ever has one conversation, so a later request reopens the same one.
 */
export class Conversation {
  private pendingEvents: DomainEvent[] = [];

  private constructor(private props: ConversationProps) {}

  static request(input: {
    id: string;
    agentId: string;
    talentId: string;
    now: Date;
  }): Conversation {
    const conversation = new Conversation({
      id: input.id,
      agentId: input.agentId,
      talentId: input.talentId,
      status: 'requested',
      requestedAt: input.now,
      respondedAt: null,
      updatedAt: input.now,
      agentReadAt: input.now,
      talentReadAt: null,
    });
    conversation.raise(ConversationEvents.ContactRequested, input.now);
    return conversation;
  }

  static restore(props: ConversationProps): Conversation {
    return new Conversation(props);
  }

  get id(): string {
    return this.props.id;
  }
  get agentId(): string {
    return this.props.agentId;
  }
  get talentId(): string {
    return this.props.talentId;
  }
  get status(): ConversationStatus {
    return this.props.status;
  }

  snapshot(): ConversationProps {
    return { ...this.props };
  }

  /** Which side the user is on, or null when they are not in it. */
  sideOf(userId: string): 'agent' | 'talent' | null {
    if (userId === this.props.agentId) return 'agent';
    if (userId === this.props.talentId) return 'talent';
    return null;
  }

  otherThan(userId: string): string {
    return userId === this.props.agentId ? this.props.talentId : this.props.agentId;
  }

  readAtFor(userId: string): Date | null {
    return this.sideOf(userId) === 'agent' ? this.props.agentReadAt : this.props.talentReadAt;
  }

  /** The agent asks again after a withdrawal, or once the decline cooldown has passed. */
  requestAgain(now: Date): Result<void, DomainError> {
    switch (this.props.status) {
      case 'requested':
        return err(MessagingErrors.pending());
      case 'accepted':
        return err(MessagingErrors.alreadyConnected());
      case 'declined': {
        const waitUntil =
          (this.props.respondedAt ?? now).getTime() + CONTACT_DECLINE_COOLDOWN_DAYS * DAY_MS;
        if (now.getTime() < waitUntil) {
          return err(
            MessagingErrors.declinedRecently(Math.ceil((waitUntil - now.getTime()) / 1000)),
          );
        }
        break;
      }
      case 'withdrawn':
        break;
    }
    this.props = {
      ...this.props,
      status: 'requested',
      requestedAt: now,
      respondedAt: null,
      updatedAt: now,
      agentReadAt: now,
    };
    this.raise(ConversationEvents.ContactRequested, now);
    return ok(undefined);
  }

  respond(accept: boolean, now: Date): Result<void, DomainError> {
    if (this.props.status !== 'requested') return err(MessagingErrors.notRequested());
    this.props = {
      ...this.props,
      status: accept ? 'accepted' : 'declined',
      respondedAt: now,
      updatedAt: now,
      talentReadAt: now,
    };
    this.raise(
      accept ? ConversationEvents.ContactAccepted : ConversationEvents.ContactDeclined,
      now,
    );
    return ok(undefined);
  }

  withdraw(now: Date): Result<void, DomainError> {
    if (this.props.status !== 'requested') return err(MessagingErrors.notRequested());
    this.props = { ...this.props, status: 'withdrawn', respondedAt: now, updatedAt: now };
    return ok(undefined);
  }

  /** A message went in: it moves the conversation up the list, and the sender has read it. */
  messageSent(senderId: string, at: Date): void {
    this.props = { ...this.props, updatedAt: at };
    this.markRead(senderId, at);
  }

  markRead(userId: string, at: Date): void {
    const side = this.sideOf(userId);
    if (side === 'agent') this.props = { ...this.props, agentReadAt: at };
    if (side === 'talent') this.props = { ...this.props, talentReadAt: at };
  }

  pullEvents(): DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  private raise(type: string, occurredAt: Date): void {
    this.pendingEvents.push({
      type,
      aggregateId: this.props.id,
      occurredAt,
      payload: { agentId: this.props.agentId, talentId: this.props.talentId },
    });
  }
}

export interface StoredMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly body: string;
  readonly clientMessageId: string;
  readonly sentAt: Date;
}

/** Thrown by addMessage when the same client id was stored by a retry that arrived at once. */
export class DuplicateMessageError extends Error {}

/** Thrown by save when another request for the same pair won a race. */
export class ConversationExistsError extends Error {}

export interface ConversationRepository {
  findById(id: string, options?: { lock?: boolean }): Promise<Conversation | null>;
  findByPair(
    agentId: string,
    talentId: string,
    options?: { lock?: boolean },
  ): Promise<Conversation | null>;
  /** Inserts or updates, and records the conversation's events in the same transaction. */
  save(conversation: Conversation): Promise<void>;
  /**
   * Conversations the user can see, newest activity first. Talent do not see requests that
   * were withdrawn or that they declined; agents see all of theirs.
   */
  pageFor(
    userId: string,
    after: { updatedAt: Date; id: string } | null,
    limit: number,
  ): Promise<Conversation[]>;
  /** Requests waiting for this talent, plus open chats with messages they have not read. */
  countNeedingAttention(userId: string): Promise<number>;
  allFor(userId: string): Promise<Conversation[]>;

  addMessage(message: StoredMessage): Promise<void>;
  findMessage(
    conversationId: string,
    senderId: string,
    clientMessageId: string,
  ): Promise<StoredMessage | null>;
  /** Newest first. */
  messages(
    conversationId: string,
    after: { sentAt: Date; id: string } | null,
    limit: number,
  ): Promise<StoredMessage[]>;
  /** Messages from anyone but the reader, sent after the time given (all of them when null). */
  countUnread(conversationId: string, readerId: string, since: Date | null): Promise<number>;
  messagesBy(senderId: string, conversationId: string): Promise<StoredMessage[]>;
  countFromOthers(conversationId: string, userId: string): Promise<number>;
}
