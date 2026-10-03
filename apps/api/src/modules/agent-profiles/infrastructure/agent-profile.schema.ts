import { index, integer, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
