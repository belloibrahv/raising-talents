import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgSchema,
  text,
  varchar,
} from 'drizzle-orm/pg-core';

export const taxonomySchema = pgSchema('taxonomy');

export const categories = taxonomySchema.table('categories', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  active: boolean('active').notNull().default(true),
});

export const subcategories = taxonomySchema.table(
  'subcategories',
  {
    slug: text('slug').primaryKey(),
    categorySlug: text('category_slug')
      .notNull()
      .references(() => categories.slug),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (table) => [index('subcategories_category_idx').on(table.categorySlug)],
);

export const skills = taxonomySchema.table('skills', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  // Null means the skill applies to every category (languages, for example).
  categorySlug: text('category_slug').references(() => categories.slug),
  active: boolean('active').notNull().default(true),
});

/** City centres only. Talent location is never more precise than the city. */
export const cities = taxonomySchema.table('cities', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  countryCode: varchar('country_code', { length: 2 }).notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  active: boolean('active').notNull().default(true),
});
