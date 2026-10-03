// The single schema entry point for Drizzle and drizzle-kit migrations.
// It is the only platform file allowed to import module infrastructure,
// and it only re-exports table definitions.
export * from '../outbox/outbox.schema.js';
export * from '../../modules/accounts/infrastructure/account.schema.js';
export * from '../../modules/identity/infrastructure/identity.schema.js';
export * from '../../modules/taxonomy/infrastructure/taxonomy.schema.js';
export * from '../../modules/talent-profiles/infrastructure/talent-profile.schema.js';
export * from '../../modules/agent-profiles/infrastructure/agent-profile.schema.js';
export * from '../../modules/media/infrastructure/media.schema.js';
export * from '../../modules/portfolio/infrastructure/portfolio.schema.js';
export * from '../../modules/notifications/infrastructure/notification.schema.js';
