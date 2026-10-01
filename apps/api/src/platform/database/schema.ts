// The single schema entry point for Drizzle and drizzle-kit migrations.
// It is the only platform file allowed to import module infrastructure,
// and it only re-exports table definitions.
export * from '../outbox/outbox.schema.js';
export * from '../../modules/accounts/infrastructure/account.schema.js';
export * from '../../modules/identity/infrastructure/identity.schema.js';
