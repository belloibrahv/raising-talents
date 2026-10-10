import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/platform/database/schema.ts',
  out: './drizzle',
  schemaFilter: [
    'accounts',
    'identity',
    'platform',
    'taxonomy',
    'talent',
    'agent',
    'media',
    'portfolio',
    'notifications',
    'safety',
    'shortlist',
    'messaging',
    'social',
  ],
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://raising_talents:raising_talents@localhost:5432/raising_talents',
  },
  strict: true,
  verbose: true,
});
