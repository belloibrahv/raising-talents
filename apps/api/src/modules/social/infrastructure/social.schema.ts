import { index, pgSchema, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../accounts/infrastructure/account.schema.js';
import { portfolioItems } from '../../portfolio/infrastructure/portfolio.schema.js';

export const socialSchema = pgSchema('social');

/** One row per follower and talent. Both sides cascade: an erased account takes its rows. */
export const follows = socialSchema.table(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    talentId: uuid('talent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followedAt: timestamp('followed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.talentId] }),
    // "Who I follow", most recent first.
    index('follows_follower_recent_idx').on(table.followerId, table.followedAt, table.talentId),
    // Counting a talent's followers.
    index('follows_talent_idx').on(table.talentId),
  ],
);

/** One row per person and piece of work. Removing the work or the account removes the like. */
export const likes = socialSchema.table(
  'likes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => portfolioItems.id, { onDelete: 'cascade' }),
    likedAt: timestamp('liked_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.itemId] }),
    // Counting the likes on a page of posts.
    index('likes_item_idx').on(table.itemId),
  ],
);
