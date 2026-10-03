import { sql } from 'drizzle-orm';
import { index, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../accounts/infrastructure/account.schema.js';

export const safetySchema = pgSchema('safety');

export const reportCategoryEnum = safetySchema.enum('report_category', [
  'fake_or_impersonation',
  'inappropriate_content',
  'scam_or_harassment',
  'underage',
  'other',
]);
export const reportStatusEnum = safetySchema.enum('report_status', [
  'open',
  'dismissed',
  'actioned',
]);
export const enforcementActionEnum = safetySchema.enum('enforcement_action', [
  'suspend',
  'ban',
  'reinstate',
]);

export const reports = safetySchema.table(
  'reports',
  {
    id: uuid('id').primaryKey(),
    // Kept when the reporter's account is erased: the report still happened.
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: reportCategoryEnum('category').notNull(),
    note: text('note').notNull().default(''),
    status: reportStatusEnum('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    // The queue: open reports grouped by account, oldest first.
    index('reports_open_idx')
      .on(table.subjectId, table.createdAt)
      .where(sql`status = 'open'`),
    // One open report per reporter and account, even if two arrive at once.
    uniqueIndex('reports_one_open_per_reporter')
      .on(table.reporterId, table.subjectId)
      .where(sql`status = 'open'`),
  ],
);

export const enforcementActions = safetySchema.table(
  'enforcement_actions',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: enforcementActionEnum('action').notNull(),
    reason: reportCategoryEnum('reason'),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('enforcement_actions_account_idx').on(table.accountId, table.createdAt)],
);
