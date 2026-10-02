import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../../accounts/infrastructure/account.schema.js';
import { categories, cities } from '../../taxonomy/infrastructure/taxonomy.schema.js';

export const agentSchema = pgSchema('agent');

export const agentProfiles = agentSchema.table('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  agencyName: text('agency_name'),
  jobTitle: text('job_title'),
  citySlug: text('city_slug').references(() => cities.slug),
  website: text('website'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  version: integer('version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const agentSpecializations = agentSchema.table(
  'profile_specializations',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => agentProfiles.userId, { onDelete: 'cascade' }),
    categorySlug: text('category_slug')
      .notNull()
      .references(() => categories.slug),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.categorySlug] }),
    index('profile_specializations_category_idx').on(table.categorySlug),
  ],
);

export const verificationStatusEnum = agentSchema.enum('verification_status', [
  'pending',
  'approved',
  'declined',
]);
export const verificationDeclineEnum = agentSchema.enum('verification_decline_category', [
  'agency_not_confirmed',
  'details_do_not_match',
  'evidence_unreachable',
  'other',
]);

export const verificationRequests = agentSchema.table(
  'verification_requests',
  {
    id: uuid('id').primaryKey(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: verificationStatusEnum('status').notNull(),
    evidenceUrl: text('evidence_url').notNull(),
    registrationNumber: text('registration_number'),
    note: text('note').notNull().default(''),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    declineCategory: verificationDeclineEnum('decline_category'),
  },
  (table) => [
    index('verification_requests_agent_idx').on(table.agentId, table.submittedAt),
    // The moderation queue: pending requests, oldest first.
    index('verification_requests_pending_idx')
      .on(table.submittedAt, table.id)
      .where(sql`status = 'pending'`),
    // At most one open request per agent, even if two arrive at once.
    uniqueIndex('verification_requests_one_pending')
      .on(table.agentId)
      .where(sql`status = 'pending'`),
  ],
);
