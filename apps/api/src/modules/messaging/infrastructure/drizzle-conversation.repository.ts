import { and, count, desc, eq, gt, inArray, lt, ne, or, sql } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import type { EventRecorder } from '../../../platform/domain-event.js';
import {
  Conversation,
  ConversationExistsError,
  DuplicateMessageError,
  type ConversationRepository,
  type StoredMessage,
} from '../domain/conversation.js';
import { conversations, messages } from './messaging.schema.js';

const isUniqueClash = (error: unknown, constraint: string): boolean => {
  const cause =
    (error as { cause?: { code?: string; constraint?: string } }).cause ??
    (error as { code?: string; constraint?: string });
  return cause.code === '23505' && cause.constraint === constraint;
};

/** Agents see all of theirs; talent see requests and open chats only. */
const visibleTo = (userId: string) =>
  or(
    eq(conversations.agentId, userId),
    and(
      eq(conversations.talentId, userId),
      inArray(conversations.status, ['requested', 'accepted']),
    ),
  );

export class DrizzleConversationRepository implements ConversationRepository {
  constructor(
    private readonly uow: DrizzleUnitOfWork,
    private readonly events: EventRecorder,
  ) {}

  async findById(id: string, options: { lock?: boolean } = {}): Promise<Conversation | null> {
    const query = this.uow
      .executor()
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    const [row] = options.lock ? await query.for('update') : await query;
    return row ? Conversation.restore(row) : null;
  }

  async findByPair(
    agentId: string,
    talentId: string,
    options: { lock?: boolean } = {},
  ): Promise<Conversation | null> {
    const query = this.uow
      .executor()
      .select()
      .from(conversations)
      .where(and(eq(conversations.agentId, agentId), eq(conversations.talentId, talentId)))
      .limit(1);
    const [row] = options.lock ? await query.for('update') : await query;
    return row ? Conversation.restore(row) : null;
  }

  async save(conversation: Conversation): Promise<void> {
    const row = conversation.snapshot();
    try {
      await this.uow
        .executor()
        .insert(conversations)
        .values(row)
        .onConflictDoUpdate({
          target: conversations.id,
          set: {
            status: row.status,
            requestedAt: row.requestedAt,
            respondedAt: row.respondedAt,
            updatedAt: row.updatedAt,
            agentReadAt: row.agentReadAt,
            talentReadAt: row.talentReadAt,
          },
        });
    } catch (error) {
      if (isUniqueClash(error, 'conversations_one_per_pair')) throw new ConversationExistsError();
      throw error;
    }
    await this.events.record(conversation.pullEvents());
  }

  async pageFor(
    userId: string,
    after: { updatedAt: Date; id: string } | null,
    limit: number,
  ): Promise<Conversation[]> {
    const rows = await this.uow
      .executor()
      .select()
      .from(conversations)
      .where(
        and(
          visibleTo(userId),
          after
            ? or(
                lt(conversations.updatedAt, after.updatedAt),
                and(eq(conversations.updatedAt, after.updatedAt), lt(conversations.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(conversations.updatedAt), desc(conversations.id))
      .limit(limit);
    return rows.map((row) => Conversation.restore(row));
  }

  async countNeedingAttention(userId: string): Promise<number> {
    // A message from the other person after the reader last looked.
    const unreadExists = sql`exists (
      select 1 from ${messages}
      where ${messages.conversationId} = ${conversations.id}
        and ${messages.senderId} <> ${userId}
        and ${messages.sentAt} > coalesce(
          case when ${conversations.agentId} = ${userId}
            then ${conversations.agentReadAt} else ${conversations.talentReadAt} end,
          '-infinity'::timestamptz)
    )`;
    const [row] = await this.uow
      .executor()
      .select({ total: count() })
      .from(conversations)
      .where(
        or(
          and(eq(conversations.talentId, userId), eq(conversations.status, 'requested')),
          and(
            eq(conversations.status, 'accepted'),
            or(eq(conversations.agentId, userId), eq(conversations.talentId, userId)),
            unreadExists,
          ),
        ),
      );
    return row?.total ?? 0;
  }

  async allFor(userId: string): Promise<Conversation[]> {
    const rows = await this.uow
      .executor()
      .select()
      .from(conversations)
      .where(or(eq(conversations.agentId, userId), eq(conversations.talentId, userId)))
      .orderBy(desc(conversations.updatedAt));
    return rows.map((row) => Conversation.restore(row));
  }

  async addMessage(message: StoredMessage): Promise<void> {
    try {
      await this.uow.executor().insert(messages).values(message);
    } catch (error) {
      if (isUniqueClash(error, 'messages_one_per_client_id')) throw new DuplicateMessageError();
      throw error;
    }
  }

  async findMessage(
    conversationId: string,
    senderId: string,
    clientMessageId: string,
  ): Promise<StoredMessage | null> {
    const [row] = await this.uow
      .executor()
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.senderId, senderId),
          eq(messages.clientMessageId, clientMessageId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async messages(
    conversationId: string,
    after: { sentAt: Date; id: string } | null,
    limit: number,
  ): Promise<StoredMessage[]> {
    return this.uow
      .executor()
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          after
            ? or(
                lt(messages.sentAt, after.sentAt),
                and(eq(messages.sentAt, after.sentAt), lt(messages.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(messages.sentAt), desc(messages.id))
      .limit(limit);
  }

  async countUnread(conversationId: string, readerId: string, since: Date | null): Promise<number> {
    const [row] = await this.uow
      .executor()
      .select({ total: count() })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          ne(messages.senderId, readerId),
          since ? gt(messages.sentAt, since) : undefined,
        ),
      );
    return row?.total ?? 0;
  }

  async messagesBy(senderId: string, conversationId: string): Promise<StoredMessage[]> {
    return this.uow
      .executor()
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.senderId, senderId)))
      .orderBy(messages.sentAt);
  }

  async countFromOthers(conversationId: string, userId: string): Promise<number> {
    return this.countUnread(conversationId, userId, null);
  }
}
