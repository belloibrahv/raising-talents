import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../../accounts/infrastructure/account.schema.js';
import {
  categories,
  cities,
  skills,
  subcategories,
} from '../../taxonomy/infrastructure/taxonomy.schema.js';

export const talentSchema = pgSchema('talent');

export const genderEnum = talentSchema.enum('gender', ['female', 'male', 'non_binary']);

export const profiles = talentSchema.table(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    handle: text('handle').notNull(),
    displayName: text('display_name'),
    bio: text('bio').notNull().default(''),
    categorySlug: text('category_slug').references(() => categories.slug),
    citySlug: text('city_slug').references(() => cities.slug),
    gender: genderEnum('gender'),
    genderSearchable: boolean('gender_searchable').notNull().default(false),
    publicLink: boolean('public_link').notNull().default(false),
    avatarMediaId: uuid('avatar_media_id'),
    // Category-specific fields (height, playing position), validated per category once the list is agreed.
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    isComplete: boolean('is_complete').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    version: integer('version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('profiles_handle_unique').on(table.handle),
    index('profiles_complete_category_idx')
      .on(table.categorySlug)
      .where(sql`is_complete`),
  ],
);

export const profileSubcategories = talentSchema.table(
  'profile_subcategories',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    subcategorySlug: text('subcategory_slug')
      .notNull()
      .references(() => subcategories.slug),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.subcategorySlug] }),
    index('profile_subcategories_slug_idx').on(table.subcategorySlug),
  ],
);

export const profileSkills = talentSchema.table(
  'profile_skills',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId, { onDelete: 'cascade' }),
    skillSlug: text('skill_slug')
      .notNull()
      .references(() => skills.slug),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.skillSlug] }),
    index('profile_skills_slug_idx').on(table.skillSlug),
  ],
);
