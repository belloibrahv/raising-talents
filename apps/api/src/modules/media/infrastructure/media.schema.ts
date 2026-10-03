import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../accounts/infrastructure/account.schema.js';

export const mediaSchema = pgSchema('media');

export const mediaPurposeEnum = mediaSchema.enum('purpose', ['avatar', 'portfolio']);
export const mediaStatusEnum = mediaSchema.enum('status', [
  'awaiting_upload',
  'processing',
  'scanning',
  'ready',
  'held_for_review',
  'rejected',
  'failed',
  'deleted',
]);

export const assets = mediaSchema.table(
  'assets',
  {
    id: uuid('id').primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: mediaPurposeEnum('purpose').notNull(),
    status: mediaStatusEnum('status').notNull(),
    contentType: text('content_type').notNull(),
    declaredBytes: integer('declared_bytes').notNull(),
    actualBytes: integer('actual_bytes'),
    moderationLabels: jsonb('moderation_labels')
      .$type<{ name: string; parentName: string | null; confidence: number }[]>()
      .notNull()
      .default([]),
    rejectionReason: text('rejection_reason'),
    failureReason: text('failure_reason'),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('assets_owner_idx').on(table.ownerId, table.createdAt),
    // Finds abandoned intents for the cleanup job.
    index('assets_awaiting_upload_idx')
      .on(table.createdAt)
      .where(sql`status = 'awaiting_upload'`),
  ],
);
