import { z } from 'zod';

const booleanFromString = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Every setting the backend reads. A missing or wrong value stops startup. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** JSON everywhere except a developer's terminal. pretty needs pino-pretty, a dev dependency. */
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  TRUST_PROXY: booleanFromString.default(false),

  // Either one URL (local development) or separate parts (AWS, where RDS keeps the
  // username and password in Secrets Manager and ECS injects them).
  DATABASE_URL: z.url().optional(),
  DATABASE_HOST: z.string().min(1).optional(),
  DATABASE_PORT: z.coerce.number().int().positive().default(5432),
  DATABASE_NAME: z.string().min(1).optional(),
  DATABASE_USER: z.string().min(1).optional(),
  DATABASE_PASSWORD: z.string().min(1).optional(),
  /** verify-full checks the server certificate against DATABASE_CA_FILE. Required on AWS. */
  DATABASE_SSL: z.enum(['disable', 'verify-full']).default('disable'),
  DATABASE_CA_FILE: z.string().min(1).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  REDIS_URL: z.url(),

  JWT_PRIVATE_KEY_BASE64: z.string().min(1),
  JWT_PUBLIC_KEY_BASE64: z.string().min(1),
  JWT_KEY_ID: z.string().min(1),
  JWT_ISSUER: z.string().min(1).default('https://api.raisingtalents.app'),
  JWT_AUDIENCE: z.string().min(1).default('raising-talents-app'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  VERIFICATION_CODE_PEPPER: z.string().min(32),

  /** ses on AWS (no credentials, uses the task role). smtp for Mailpit locally. */
  EMAIL_TRANSPORT: z.enum(['smtp', 'ses']).default('smtp'),
  SES_CONFIGURATION_SET: z.string().min(1).optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: booleanFromString.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().min(3).default('Raising Talents <no-reply@raisingtalents.app>'),

  BREACHED_PASSWORD_CHECK: booleanFromString.default(true),
});

const checkedEnvSchema = envSchema.superRefine((env, ctx) => {
  const hasParts =
    env.DATABASE_HOST && env.DATABASE_NAME && env.DATABASE_USER && env.DATABASE_PASSWORD;
  if (!env.DATABASE_URL && !hasParts) {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message:
        'Set DATABASE_URL, or all of DATABASE_HOST, DATABASE_NAME, DATABASE_USER and DATABASE_PASSWORD',
    });
  }
  if (env.EMAIL_TRANSPORT === 'smtp' && (!env.SMTP_HOST || !env.SMTP_PORT)) {
    ctx.addIssue({
      code: 'custom',
      path: ['SMTP_HOST'],
      message: 'smtp transport needs SMTP_HOST and SMTP_PORT',
    });
  }
  if (env.DATABASE_SSL === 'verify-full' && !env.DATABASE_CA_FILE) {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_CA_FILE'],
      message: 'verify-full needs the CA bundle path',
    });
  }
  if (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') {
    if (env.DATABASE_SSL !== 'verify-full') {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_SSL'],
        message: 'Staging and production must use verify-full',
      });
    }
    if (!env.REDIS_URL.startsWith('rediss://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'Staging and production must use TLS (rediss://)',
      });
    }
  }
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = checkedEnvSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid configuration:\n${problems.join('\n')}`);
  }
  return parsed.data;
}

const databaseKeys = {
  DATABASE_URL: true,
  DATABASE_HOST: true,
  DATABASE_PORT: true,
  DATABASE_NAME: true,
  DATABASE_USER: true,
  DATABASE_PASSWORD: true,
  DATABASE_SSL: true,
  DATABASE_CA_FILE: true,
  DATABASE_POOL_MAX: true,
} as const;

export type DatabaseConfig = Pick<AppConfig, keyof typeof databaseKeys>;

/**
 * Only the database settings. The migration task uses this, so it never needs
 * the signing keys or any other secret it does not use.
 */
export function loadDatabaseConfig(source: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const parsed = envSchema.pick(databaseKeys).safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid database configuration:\n${parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n')}`,
    );
  }
  const config = parsed.data;
  if (
    !config.DATABASE_URL &&
    !(
      config.DATABASE_HOST &&
      config.DATABASE_NAME &&
      config.DATABASE_USER &&
      config.DATABASE_PASSWORD
    )
  ) {
    throw new Error(
      'Set DATABASE_URL, or all of DATABASE_HOST, DATABASE_NAME, DATABASE_USER and DATABASE_PASSWORD',
    );
  }
  return config;
}
