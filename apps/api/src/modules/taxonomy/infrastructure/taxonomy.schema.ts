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

/** ISO 3166-1 alpha-2 countries that have at least one city to pick (ADR-046). */
export const countries = taxonomySchema.table('countries', {
  code: varchar('code', { length: 2 }).primaryKey(),
  name: text('name').notNull(),
  /** Other names people type, comma separated: "UK, England" for the United Kingdom. */
  searchTerms: text('search_terms').notNull().default(''),
  active: boolean('active').notNull().default(true),
});

/**
 * City centres only. Talent location is never more precise than the city.
 * country_code is checked against countries by the catalog, not a foreign key, so the
 * reference data can be loaded in any order.
 */
export const cities = taxonomySchema.table(
  'cities',
  {
    slug: text('slug').primaryKey(),
    name: text('name').notNull(),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    /** State, province or nation, to tell namesakes apart: Portland, Oregon. */
    region: text('region'),
    /** Largest first in pickers. */
    population: integer('population').notNull().default(0),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (table) => [index('cities_country_idx').on(table.countryCode)],
);
