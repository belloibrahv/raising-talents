import type { EventRecorder } from '../../../platform/domain-event.js';
import {
  Conversation,
  ConversationExistsError,
  DuplicateMessageError,
  type ConversationProps,
  type ConversationRepository,
  type StoredMessage,
} from '../domain/conversation.js';

const newestFirst = (a: { at: Date; id: string }, b: { at: Date; id: string }) =>
  b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id);

const isBefore = (row: { at: Date; id: string }, after: { at: Date; id: string } | null) =>
  after === null || newestFirst(after, row) < 0;

export class InMemoryConversationRepository implements ConversationRepository {
  readonly rows = new Map<string, ConversationProps>();
  readonly messageRows: StoredMessage[] = [];

  constructor(private readonly events: EventRecorder) {}

  async findById(id: string): Promise<Conversation | null> {
    const row = this.rows.get(id);
    return row ? Conversation.restore(row) : null;
  }

  async findByPair(agentId: string, talentId: string): Promise<Conversation | null> {
    const row = [...this.rows.values()].find(
      (candidate) => candidate.agentId === agentId && candidate.talentId === talentId,
    );
    return row ? Conversation.restore(row) : null;
  }

  async save(conversation: Conversation): Promise<void> {
    const props = conversation.snapshot();
    const clash = [...this.rows.values()].find(
      (row) => row.agentId === props.agentId && row.talentId === props.talentId,
    );
    if (clash && clash.id !== props.id) throw new ConversationExistsError();
    this.rows.set(props.id, props);
    await this.events.record(conversation.pullEvents());
  }

  private visibleTo(row: ConversationProps, userId: string): boolean {
    if (row.agentId === userId) return true;
    return (
      row.talentId === userId &&
      (row.status === 'requested' || row.status === 'accepted' || row.blockedBy === userId)
    );
  }

  async pageFor(
    userId: string,
    after: { updatedAt: Date; id: string } | null,
    limit: number,
  ): Promise<Conversation[]> {
    return [...this.rows.values()]
      .filter((row) => this.visibleTo(row, userId))
      .map((row) => ({ row, key: { at: row.updatedAt, id: row.id } }))
      .sort((a, b) => newestFirst(a.key, b.key))
      .filter(({ key }) => isBefore(key, after ? { at: after.updatedAt, id: after.id } : null))
      .slice(0, limit)
      .map(({ row }) => Conversation.restore(row));
  }

  async countNeedingAttention(userId: string): Promise<number> {
    let total = 0;
    for (const row of this.rows.values()) {
      if (row.talentId === userId && row.status === 'requested' && !row.blockedBy) total += 1;
      else if (row.status === 'accepted' && (row.agentId === userId || row.talentId === userId)) {
        const readAt = row.agentId === userId ? row.agentReadAt : row.talentReadAt;
        if ((await this.countUnread(row.id, userId, readAt)) > 0) total += 1;
      }
    }
    return total;
  }

  async allFor(userId: string): Promise<Conversation[]> {
    return [...this.rows.values()]
      .filter((row) => row.agentId === userId || row.talentId === userId)
      .map((row) => Conversation.restore(row));
  }

  async addMessage(message: StoredMessage): Promise<void> {
    if (await this.findMessage(message.conversationId, message.senderId, message.clientMessageId)) {
      throw new DuplicateMessageError();
    }
    this.messageRows.push(message);
  }

  async findMessage(
    conversationId: string,
    senderId: string,
    clientMessageId: string,
  ): Promise<StoredMessage | null> {
    return (
      this.messageRows.find(
        (message) =>
          message.conversationId === conversationId &&
          message.senderId === senderId &&
          message.clientMessageId === clientMessageId,
      ) ?? null
    );
  }

  async messages(
    conversationId: string,
    after: { sentAt: Date; id: string } | null,
    limit: number,
  ): Promise<StoredMessage[]> {
    return this.messageRows
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => newestFirst({ at: a.sentAt, id: a.id }, { at: b.sentAt, id: b.id }))
      .filter((message) =>
        isBefore(
          { at: message.sentAt, id: message.id },
          after ? { at: after.sentAt, id: after.id } : null,
        ),
      )
      .slice(0, limit);
  }

  async countUnread(conversationId: string, readerId: string, since: Date | null): Promise<number> {
    return this.messageRows.filter(
      (message) =>
        message.conversationId === conversationId &&
        message.senderId !== readerId &&
        (since === null || message.sentAt > since),
    ).length;
  }

  async messagesBy(senderId: string, conversationId: string): Promise<StoredMessage[]> {
    return this.messageRows.filter(
      (message) => message.conversationId === conversationId && message.senderId === senderId,
    );
  }

  async countFromOthers(conversationId: string, userId: string): Promise<number> {
    return this.messageRows.filter(
      (message) => message.conversationId === conversationId && message.senderId !== userId,
    ).length;
  }
}
