import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

/** A production configuration that passes, to vary one setting at a time. */
const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://rt:secret@postgres.railway.internal:5432/railway',
  DATABASE_SSL: 'disable',
  REDIS_URL: 'redis://default:secret@redis.railway.internal:6379',
  JWT_PRIVATE_KEY_BASE64: 'private',
  JWT_PUBLIC_KEY_BASE64: 'public',
  JWT_KEY_ID: 'key-1',
  VERIFICATION_CODE_PEPPER: 'a-pepper-that-is-at-least-32-characters',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  MEDIA_BUCKET: 'media-bucket',
  MEDIA_CDN_URL: 'https://api.example.com',
  CONTENT_SCANNER: 'manual-review',
  VIDEO_PROVIDER: 'disabled',
  WEB_ORIGINS: 'https://app.example.com',
};

const problems = (overrides: Record<string, string>) => {
  try {
    loadConfig({ ...production, ...overrides });
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

describe('production configuration', () => {
  it('accepts a private-network host with plain connections, manual review and no video', () => {
    expect(problems({})).toBe('');
  });

  it('requires TLS for the database and Redis outside a private network', () => {
    expect(problems({ DATABASE_URL: 'postgres://rt:secret@db.example.com:5432/rt' })).toContain(
      'DATABASE_SSL',
    );
    expect(problems({ REDIS_URL: 'redis://default:secret@redis.example.com:6379' })).toContain(
      'REDIS_URL',
    );
    expect(problems({ REDIS_URL: 'rediss://default:secret@redis.example.com:6379' })).toBe('');
  });

  it('does not take a lookalike host for the private network', () => {
    expect(
      problems({ DATABASE_URL: 'postgres://rt:secret@railway.internal.example.com:5432/rt' }),
    ).toContain('DATABASE_SSL');
  });

  it('refuses the development scanners, which approve or fake labels', () => {
    expect(problems({ CONTENT_SCANNER: 'development-allow-all' })).toContain('CONTENT_SCANNER');
    expect(problems({ CONTENT_SCANNER: 'development-hold-all' })).toContain('CONTENT_SCANNER');
  });

  it('still requires https origins and secure cookies', () => {
    expect(problems({ WEB_ORIGINS: 'http://app.example.com' })).toContain('WEB_ORIGINS');
    expect(problems({ WEB_COOKIE_SECURE: 'false' })).toContain('WEB_COOKIE_SECURE');
  });
});
