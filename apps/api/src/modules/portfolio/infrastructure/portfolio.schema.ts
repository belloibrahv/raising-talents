import { index, integer, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../accounts/infrastructure/account.schema.js';
import { assets } from '../../media/infrastructure/media.schema.js';

export const portfolioSchema = pgSchema('portfolio');

export const portfolioItemKindEnum = portfolioSchema.enum('item_kind', ['image']);

/** The aggregate root. Locking this row serialises every change to one talent's portfolio. */
export const portfolios = portfolioSchema.table('portfolios', {
  talentId: uuid('talent_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const portfolioItems = portfolioSchema.table(
  'items',
  {
    id: uuid('id').primaryKey(),
    talentId: uuid('talent_id')
      .notNull()
      .references(() => portfolios.talentId, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => assets.id),
    kind: portfolioItemKindEnum('kind').notNull(),
    caption: text('caption').notNull().default(''),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // One file, one item. Also what stops two concurrent adds of the same file.
    uniqueIndex('items_media_unique').on(table.mediaId),
    index('items_talent_position_idx').on(table.talentId, table.position),
  ],
);
