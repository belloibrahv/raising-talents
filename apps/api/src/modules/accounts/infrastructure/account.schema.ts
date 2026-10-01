import { date, pgSchema, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const accountsSchema = pgSchema('accounts');

export const roleEnum = accountsSchema.enum('role', ['talent', 'agent', 'moderator', 'admin']);
export const accountStatusEnum = accountsSchema.enum('account_status', [
  'onboarding',
  'active',
  'suspended',
  'banned',
  'pending_deletion',
]);

export const users = accountsSchema.table(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    role: roleEnum('role'),
    roleLockedAt: timestamp('role_locked_at', { withTimezone: true }),
    status: accountStatusEnum('status').notNull(),
    dateOfBirth: date('date_of_birth', { mode: 'string' }).notNull(),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    deletionScheduledAt: timestamp('deletion_scheduled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export type UserRow = typeof users.$inferSelect;
