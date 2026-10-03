import { sql } from 'drizzle-orm';
import { index, jsonb, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../accounts/infrastructure/account.schema.js';

export const notificationsSchema = pgSchema('notifications');

/** One row per email sent for an event, keyed by the event, so redeliveries send nothing. */
export const sentNotifications = notificationsSchema.table('sent', {
  key: text('key').primaryKey(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
});

/**
 * The in-app inbox. The kind and its details are stored as data and worded by the app
 * (ADR-032). The key is the event that caused the notice, so redeliveries add nothing.
 */
export const inboxNotices = notificationsSchema.table(
  'inbox',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    data: jsonb('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('inbox_key_unique').on(table.key),
    index('inbox_user_created_idx').on(table.userId, table.createdAt, table.id),
    index('inbox_user_unread_idx')
      .on(table.userId)
      .where(sql`read_at is null`),
    index('inbox_created_idx').on(table.createdAt),
  ],
);
