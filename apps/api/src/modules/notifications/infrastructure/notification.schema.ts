import { pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

export const notificationsSchema = pgSchema('notifications');

/** One row per email sent for an event, keyed by the event, so redeliveries send nothing. */
export const sentNotifications = notificationsSchema.table('sent', {
  key: text('key').primaryKey(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
});
