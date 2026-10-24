import { index, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../accounts/infrastructure/account.schema.js';

export const messagingSchema = pgSchema('messaging');

export const conversationStatus = messagingSchema.enum('conversation_status', [
  'requested',
  'accepted',
  'declined',
  'withdrawn',
]);

export const conversationSide = messagingSchema.enum('conversation_side', ['agent', 'talent']);

/** Between an agent and a talent (ADR-038), or between two talent (ADR-061). */
export const conversationKind = messagingSchema.enum('conversation_kind', ['agent', 'peer']);

/**
 * One per pair. Both sides cascade: an erased account takes its conversations. Between two
 * talent, agent_id holds the one whose id sorts first, so the pair index still holds one.
 */
export const conversations = messagingSchema.table(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    kind: conversationKind('kind').notNull().default('agent'),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    talentId: uuid('talent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: conversationStatus('status').notNull(),
    /** Who asked: the agent (a contact request) or the talent (a submission, ADR-050). */
    requestedBy: conversationSide('requested_by').notNull().default('agent'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    agentReadAt: timestamp('agent_read_at', { withTimezone: true }),
    talentReadAt: timestamp('talent_read_at', { withTimezone: true }),
    // Set null if the blocker's account is erased: the conversation is going with it anyway.
    blockedBy: uuid('blocked_by').references(() => users.id, { onDelete: 'set null' }),
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('conversations_one_per_pair').on(table.agentId, table.talentId),
    // Each person's list, newest activity first.
    index('conversations_agent_updated_idx').on(table.agentId, table.updatedAt, table.id),
    index('conversations_talent_updated_idx').on(table.talentId, table.updatedAt, table.id),
  ],
);

export const messages = messagingSchema.table(
  'messages',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    /** Made by the client once per message, so a retried send is recognised (ADR-009). */
    clientMessageId: uuid('client_message_id').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('messages_one_per_client_id').on(
      table.conversationId,
      table.senderId,
      table.clientMessageId,
    ),
    index('messages_conversation_sent_idx').on(table.conversationId, table.sentAt, table.id),
    // Erasing an account finds its messages without a full scan.
    index('messages_sender_idx').on(table.senderId),
  ],
);
