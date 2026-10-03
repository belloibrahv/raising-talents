import { ErrorCode, type AuthResponse, type MeResponse, type ProblemDetails } from '@rt/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/create-test-app.js';

describe('Auth over HTTP', () => {
  let app: NestFastifyApplication;
  let testApp: TestApp;

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

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it('walks a new agent through sign-up, role choice and email verification', async () => {
    const signUp = await post('/v1/auth/sign-up', tunde);
    expect(signUp.statusCode).toBe(201);
    const auth = signUp.json<AuthResponse>();
    expect(auth.me).toMatchObject({
      email: tunde.email,
      emailVerified: false,
      role: null,
      countryCode: 'NG',
    });

    // Setting up does not wait for the email (ADR-037); being seen by others does.
    const early = await post('/v1/me/role', { role: 'agent' }, auth.tokens.accessToken);
    expect(early.statusCode).toBe(200);
    expect(early.json<MeResponse>()).toMatchObject({ role: 'agent', emailVerified: false });

    await testApp.deliverEvents();
    const code = testApp.email.lastCodeFor(tunde.email);
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
