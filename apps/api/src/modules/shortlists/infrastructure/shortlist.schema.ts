import { index, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../accounts/infrastructure/account.schema.js';

export const shortlistSchema = pgSchema('shortlist');

/** One row per agent and saved talent. Both sides cascade: an erased account takes its rows. */
export const shortlistEntries = shortlistSchema.table(
  'entries',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    talentId: uuid('talent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    note: text('note').notNull().default(''),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.talentId] }),
    // The list itself: newest first for one agent.
    index('shortlist_entries_agent_saved_idx').on(table.agentId, table.savedAt, table.talentId),
    // Erasing a talent finds their rows without a full scan.
    index('shortlist_entries_talent_idx').on(table.talentId),
  ],
);
