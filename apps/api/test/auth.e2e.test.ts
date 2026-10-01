import { ErrorCode, type AuthResponse, type MeResponse, type ProblemDetails } from '@rt/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApiApp, createFastifyAdapter } from '../src/bootstrap/create-api-app.js';
import { loadConfig } from '../src/config/env.js';
import { ACCOUNTS } from '../src/modules/accounts/application/accounts.tokens.js';
import { InMemoryAccountRepository } from '../src/modules/accounts/testing/in-memory-account.repository.js';
import { IDENTITY } from '../src/modules/identity/application/identity.tokens.js';
import type { ModuleEventHandlers } from '../src/modules/identity/identity.module.js';
import {
  CapturingEmailSender,
  FakeBreachedPasswordChecker,
  FakePasswordHasher,
  InMemoryCredentialRepository,
  InMemoryOneTimeCodeRepository,
  InMemorySessionRepository,
} from '../src/modules/identity/testing/fakes.js';
import { generateTestSigningKeys } from '../src/modules/identity/testing/identity-test-harness.js';
import { EventDispatcher } from '../src/platform/outbox/event-dispatcher.js';
import { PLATFORM } from '../src/platform/platform.tokens.js';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryRateLimiter,
  InMemoryUnitOfWork,
} from '../src/platform/testing/fakes.js';

const toBase64 = (value: string) => Buffer.from(value).toString('base64');

/**
 * Drives the real HTTP stack (routing, validation, guards, the error filter)
 * with in-memory adapters in place of Postgres, Redis and SMTP.
 */
describe('Auth over HTTP', () => {
  let app: NestFastifyApplication;
  const events = new InMemoryEventRecorder();
  const email = new CapturingEmailSender();
  const dispatcher = new EventDispatcher();

  const tunde = {
    email: 'tunde.bakare@example.com',
    password: 'casting-call-ikeja-2026',
    dateOfBirth: '1994-03-08',
    countryCode: 'ng',
    acceptedTerms: true,
    deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b',
  };

  const post = (url: string, payload: unknown, accessToken?: string) =>
    app.inject({
      method: 'POST',
      url,
      payload: payload as object,
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
    });

  const deliverEvents = async () => {
    for (const event of events.events.splice(0)) await dispatcher.dispatch(event);
  };

  beforeAll(async () => {
    const keys = await generateTestSigningKeys();
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://unused:unused@localhost:5432/unused',
      REDIS_URL: 'redis://localhost:6379',
      JWT_PRIVATE_KEY_BASE64: toBase64(keys.privateKeyPem),
      JWT_PUBLIC_KEY_BASE64: toBase64(keys.publicKeyPem),
      JWT_KEY_ID: 'e2e-key',
      VERIFICATION_CODE_PEPPER: 'e2e-pepper-0123456789abcdef0123456789abcdef',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
    });
    const logger = pino({ level: 'silent' });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register({ config, logger })],
    })
      .overrideProvider(PLATFORM.Clock)
      .useValue(new FixedClock())
      .overrideProvider(PLATFORM.UnitOfWork)
      .useValue(new InMemoryUnitOfWork())
      .overrideProvider(PLATFORM.EventRecorder)
      .useValue(events)
      .overrideProvider(PLATFORM.RateLimiter)
      .useValue(new InMemoryRateLimiter())
      .overrideProvider(PLATFORM.Redis)
      .useValue({ ping: async () => 'PONG', quit: async () => 'OK' })
      .overrideProvider(ACCOUNTS.Repository)
      .useValue(new InMemoryAccountRepository(events))
      .overrideProvider(IDENTITY.Sessions)
      .useValue(new InMemorySessionRepository())
      .overrideProvider(IDENTITY.Credentials)
      .useValue(new InMemoryCredentialRepository())
      .overrideProvider(IDENTITY.Codes)
      .useValue(new InMemoryOneTimeCodeRepository())
      .overrideProvider(IDENTITY.PasswordHasher)
      .useValue(new FakePasswordHasher())
      .overrideProvider(IDENTITY.BreachedPasswords)
      .useValue(new FakeBreachedPasswordChecker())
      .overrideProvider(IDENTITY.EmailSender)
      .useValue(email)
      .compile();

    moduleRef.get<ModuleEventHandlers>(IDENTITY.EventHandlers).register(dispatcher);
    app = configureApiApp(
      moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(config)),
      logger,
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('walks a new agent through sign-up, email verification and role choice', async () => {
    const signUp = await post('/v1/auth/sign-up', tunde);
    expect(signUp.statusCode).toBe(201);
    const auth = signUp.json<AuthResponse>();
    expect(auth.me).toMatchObject({
      email: tunde.email,
      emailVerified: false,
      role: null,
      countryCode: 'NG',
    });

    const tooEarly = await post('/v1/me/role', { role: 'agent' }, auth.tokens.accessToken);
    expect(tooEarly.statusCode).toBe(403);
    expect(tooEarly.json<ProblemDetails>().code).toBe(ErrorCode.EmailNotVerified);

    await deliverEvents();
    const code = email.lastCodeFor(tunde.email);
    const verified = await post('/v1/auth/verify-email', { code }, auth.tokens.accessToken);
    expect(verified.statusCode).toBe(200);
    expect(verified.json<MeResponse>().emailVerified).toBe(true);

    const role = await post('/v1/me/role', { role: 'agent' }, auth.tokens.accessToken);
    expect(role.statusCode).toBe(200);
    expect(role.json<MeResponse>().role).toBe('agent');

    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${auth.tokens.accessToken}` },
    });
    expect(me.json<MeResponse>()).toMatchObject({ role: 'agent', emailVerified: true });
  });

  it('rotates refresh tokens and shuts out a replayed one', async () => {
    const signIn = await post('/v1/auth/sign-in', {
      email: tunde.email,
      password: tunde.password,
      deviceId: tunde.deviceId,
    });
    expect(signIn.statusCode).toBe(200);
    const first = signIn.json<AuthResponse>().tokens.refreshToken;

    const refreshed = await post('/v1/auth/refresh', {
      refreshToken: first,
      deviceId: tunde.deviceId,
    });
    expect(refreshed.statusCode).toBe(200);

    const replay = await post('/v1/auth/refresh', {
      refreshToken: first,
      deviceId: tunde.deviceId,
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json<ProblemDetails>().code).toBe(ErrorCode.SessionRevoked);
  });

  it('answers errors as problem details with a code and trace id', async () => {
    const invalid = await post('/v1/auth/sign-up', {
      ...tunde,
      email: 'not-an-email',
      acceptedTerms: false,
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.headers['content-type']).toContain('application/problem+json');
    const problem = invalid.json<ProblemDetails>();
    expect(problem.code).toBe(ErrorCode.ValidationFailed);
    expect(problem.fields?.map((field) => field.path).sort()).toEqual(['acceptedTerms', 'email']);
    expect(problem.traceId).toBeTruthy();

    const minor = await post('/v1/auth/sign-up', {
      ...tunde,
      email: 'young.striker@example.com',
      dateOfBirth: '2012-05-05',
    });
    expect(minor.statusCode).toBe(422);
    expect(minor.json<ProblemDetails>().code).toBe(ErrorCode.UnderMinimumAge);

    const wrongPassword = await post('/v1/auth/sign-in', {
      email: tunde.email,
      password: 'wrong-password-here',
      deviceId: tunde.deviceId,
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongPassword.json<ProblemDetails>().code).toBe(ErrorCode.InvalidCredentials);

    const noToken = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(noToken.statusCode).toBe(401);
    expect(noToken.json<ProblemDetails>().code).toBe(ErrorCode.Unauthenticated);

    const unknownRoute = await app.inject({ method: 'GET', url: '/v1/does-not-exist' });
    expect(unknownRoute.statusCode).toBe(404);
    expect(unknownRoute.json<ProblemDetails>().code).toBe(ErrorCode.NotFound);
  });

  it('reports liveness without touching dependencies', async () => {
    const live = await app.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);
  });
});
