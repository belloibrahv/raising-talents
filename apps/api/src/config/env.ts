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

  MEDIA_BUCKET: z.string().min(3),
  /** CloudFront in AWS. Ready images are served from MEDIA_CDN_URL/media/... */
  MEDIA_CDN_URL: z.url(),
  /** Only for an S3-compatible server in development. Unset on AWS. */
  S3_ENDPOINT: z.url().optional(),
  S3_FORCE_PATH_STYLE: booleanFromString.default(false),
  /**
   * development-allow-all approves every image; development-hold-all sends every image to a
   * moderator, for trying the moderation queue. Both are refused in staging and production.
   */
  CONTENT_SCANNER: z
    .enum(['rekognition', 'development-allow-all', 'development-hold-all'])
    .default('rekognition'),
  SCAN_REVIEW_AT: z.coerce.number().min(0).max(100).default(50),
  SCAN_REJECT_AT: z.coerce.number().min(0).max(100).default(80),

  /** disabled refuses video uploads; mux needs every MUX_ setting. Staging and production use mux. */
  VIDEO_PROVIDER: z.enum(['mux', 'disabled']).default('disabled'),
  MUX_TOKEN_ID: z.string().min(1).optional(),
  MUX_TOKEN_SECRET: z.string().min(1).optional(),
  MUX_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** A Mux signing key for signed playback: its id and the base64 of its PEM private key. */
  MUX_SIGNING_KEY_ID: z.string().min(1).optional(),
  MUX_SIGNING_PRIVATE_KEY_BASE64: z.string().min(1).optional(),
  VIDEO_PLAYBACK_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(21_600),

  /** typesense needs TYPESENSE_URL and TYPESENSE_API_KEY; disabled answers search with 503 (ADR-006). */
  SEARCH_INDEX: z.enum(['typesense', 'disabled']).default('disabled'),
  TYPESENSE_URL: z.url().optional(),
  TYPESENSE_API_KEY: z.string().min(1).optional(),

  /**
   * Origins of the web app, comma separated, for example https://app.raisingtalents.app.
   * Only these may call the API from a browser (CORS) or use the cookie session endpoints.
   */
  WEB_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url())),
  /** The web app's address, for links in emails. */
  WEB_APP_URL: z.url().default('http://localhost:5173'),
  /** Secure cookies need HTTPS. Only a laptop on plain http://localhost may turn it off. */
  WEB_COOKIE_SECURE: booleanFromString.default(true),
});

const MUX_KEYS = [
  'MUX_TOKEN_ID',
  'MUX_TOKEN_SECRET',
  'MUX_WEBHOOK_SECRET',
  'MUX_SIGNING_KEY_ID',
  'MUX_SIGNING_PRIVATE_KEY_BASE64',
] as const;

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
  if (env.SCAN_REVIEW_AT >= env.SCAN_REJECT_AT) {
    ctx.addIssue({
      code: 'custom',
      path: ['SCAN_REVIEW_AT'],
      message: 'The review threshold must be below the reject threshold',
    });
  }
  if (env.SEARCH_INDEX === 'typesense') {
    for (const key of ['TYPESENSE_URL', 'TYPESENSE_API_KEY'] as const) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: 'typesense needs this setting' });
    }
  }
  if (env.VIDEO_PROVIDER === 'mux') {
    for (const key of MUX_KEYS) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: 'mux needs this setting' });
    }
  }
  if (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') {
    if (!env.WEB_COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEB_COOKIE_SECURE'],
        message: 'Staging and production must send the session cookie over HTTPS only',
      });
    }
    if (env.WEB_ORIGINS.some((origin) => !origin.startsWith('https://'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEB_ORIGINS'],
        message: 'Staging and production web origins must use https',
      });
    }
    if (env.VIDEO_PROVIDER !== 'mux') {
      ctx.addIssue({
        code: 'custom',
        path: ['VIDEO_PROVIDER'],
        message: 'Staging and production must process video with Mux',
      });
    }
    if (env.CONTENT_SCANNER !== 'rekognition') {
      ctx.addIssue({
        code: 'custom',
        path: ['CONTENT_SCANNER'],
        message: 'Staging and production must scan with Rekognition',
      });
    }
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
