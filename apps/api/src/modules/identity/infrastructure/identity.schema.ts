import { sql } from 'drizzle-orm';
import { index, integer, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../accounts/infrastructure/account.schema.js';

export const identitySchema = pgSchema('identity');

export const sessionRevokedReasonEnum = identitySchema.enum('session_revoked_reason', [
  'rotated',
  'signed_out',
  'reuse_detected',
  'device_mismatch',
  'account_blocked',
]);

export const codePurposeEnum = identitySchema.enum('code_purpose', ['email_verification']);

export const credentials = identitySchema.table('credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const sessions = identitySchema.table(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').notNull(),
    familyId: uuid('family_id').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: sessionRevokedReasonEnum('revoked_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('sessions_refresh_token_hash_unique').on(table.refreshTokenHash),
    index('sessions_family_idx').on(table.familyId),
    index('sessions_user_active_idx')
      .on(table.userId)
      .where(sql`revoked_at is null`),
  ],
);

export const oneTimeCodes = identitySchema.table(
  'one_time_codes',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: codePurposeEnum('purpose').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('one_time_codes_user_purpose_idx').on(table.userId, table.purpose, table.createdAt),
  ],
);
