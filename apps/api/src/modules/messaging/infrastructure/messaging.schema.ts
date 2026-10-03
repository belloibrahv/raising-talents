import { index, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../accounts/infrastructure/account.schema.js';

export const messagingSchema = pgSchema('messaging');

export const conversationStatus = messagingSchema.enum('conversation_status', [
  'requested',
  'accepted',
  'declined',
  'withdrawn',
]);

/** One per agent and talent. Both sides cascade: an erased account takes its conversations. */
export const conversations = messagingSchema.table(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    talentId: uuid('talent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: conversationStatus('status').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    agentReadAt: timestamp('agent_read_at', { withTimezone: true }),
    talentReadAt: timestamp('talent_read_at', { withTimezone: true }),
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
