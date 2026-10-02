import { describe, expect, it } from 'vitest';
import { loadConfig, loadDatabaseConfig } from '../../config/env.js';
import { poolConfig, type DatabaseSettings } from './client.js';

const base: DatabaseSettings = {
  DATABASE_URL: undefined,
  DATABASE_HOST: 'rt-staging.cluster.eu-west-1.rds.amazonaws.com',
  DATABASE_PORT: 5432,
  DATABASE_NAME: 'raising_talents',
  DATABASE_USER: 'rt_admin',
  DATABASE_PASSWORD: 'from-secrets-manager',
  DATABASE_SSL: 'verify-full',
  DATABASE_CA_FILE: '/etc/ssl/rds/global-bundle.pem',
  DATABASE_POOL_MAX: 10,
};

describe('poolConfig', () => {
  it('connects with parts and verifies the server certificate on AWS', () => {
    const config = poolConfig(base, () => 'RDS CA BUNDLE');
    expect(config).toMatchObject({
      host: base.DATABASE_HOST,
      user: 'rt_admin',
      ssl: { rejectUnauthorized: true, ca: 'RDS CA BUNDLE' },
    });
    expect(config.connectionTimeoutMillis).toBe(5_000);
  });

  it('uses a plain URL locally', () => {
    const config = poolConfig({
      ...base,
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
      DATABASE_SSL: 'disable',
    });
    expect(config.connectionString).toBe('postgres://u:p@localhost:5432/db');
    expect(config.ssl).toBeUndefined();
  });
});

describe('loadConfig database and cache rules', () => {
  const env = {
    JWT_PRIVATE_KEY_BASE64: 'a',
    JWT_PUBLIC_KEY_BASE64: 'b',
    JWT_KEY_ID: 'k',
    VERIFICATION_CODE_PEPPER: 'p'.repeat(32),
    SMTP_HOST: 'email-smtp.eu-west-1.amazonaws.com',
    SMTP_PORT: '587',
    MEDIA_BUCKET: 'raising-talents-media-test',
    MEDIA_CDN_URL: 'https://media.test',
    DATABASE_HOST: base.DATABASE_HOST,
    DATABASE_NAME: 'raising_talents',
    DATABASE_USER: 'rt_admin',
    DATABASE_PASSWORD: 'secret',
  };

  it('refuses to start staging without verified TLS to the database and cache', () => {
    expect(() =>
      loadConfig({ ...env, NODE_ENV: 'staging', REDIS_URL: 'redis://cache:6379' }),
    ).toThrow(/verify-full[\s\S]*rediss/);
  });

  const mux = {
    VIDEO_PROVIDER: 'mux',
    MUX_TOKEN_ID: 'token-id',
    MUX_TOKEN_SECRET: 'token-secret',
    MUX_WEBHOOK_SECRET: 'webhook-secret',
    MUX_SIGNING_KEY_ID: 'signing-key',
    MUX_SIGNING_PRIVATE_KEY_BASE64: 'cGVt',
  };

  it('accepts staging with verified TLS', () => {
    const config = loadConfig({
      ...env,
      ...mux,
      NODE_ENV: 'staging',
      REDIS_URL: 'rediss://default:token@cache:6379',
      DATABASE_SSL: 'verify-full',
      DATABASE_CA_FILE: '/etc/ssl/rds/global-bundle.pem',
    });
    expect(config.DATABASE_HOST).toBe(base.DATABASE_HOST);
  });

  it('refuses staging without Mux, and Mux without every setting', () => {
    const staging = {
      ...env,
      NODE_ENV: 'staging',
      REDIS_URL: 'rediss://default:token@cache:6379',
      DATABASE_SSL: 'verify-full',
      DATABASE_CA_FILE: '/etc/ssl/rds/global-bundle.pem',
    };
    expect(() => loadConfig(staging)).toThrow(/VIDEO_PROVIDER/);
    expect(() => loadConfig({ ...staging, ...mux, MUX_WEBHOOK_SECRET: undefined })).toThrow(
      /MUX_WEBHOOK_SECRET/,
    );
  });

  it('needs either a URL or every part', () => {
    expect(() =>
      loadConfig({ ...env, DATABASE_USER: undefined, REDIS_URL: 'redis://localhost:6379' }),
    ).toThrow(/DATABASE_URL/);
  });
});

describe('loadDatabaseConfig', () => {
  it('needs only database settings, so the migration task gets no other secrets', () => {
    const config = loadDatabaseConfig({
      DATABASE_HOST: 'db.internal',
      DATABASE_NAME: 'raising_talents',
      DATABASE_USER: 'rt_admin',
      DATABASE_PASSWORD: 'from-secrets-manager',
    });
    expect(config.DATABASE_HOST).toBe('db.internal');
    expect(() => loadDatabaseConfig({ DATABASE_HOST: 'db.internal' })).toThrow(/DATABASE_URL/);
  });
});
