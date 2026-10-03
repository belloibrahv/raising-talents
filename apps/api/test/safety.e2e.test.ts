import type { MyTalentProfile, ProblemDetails, ReportQueuePage } from '@rt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccountsFacade } from '../src/modules/accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../src/modules/accounts/application/accounts.tokens.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const PASSWORD = 'relay-baton-ikorodu-26';
const BIO = 'Highlife guitarist from Ibadan. Session work for three labels and a weekly residency.';

describe('Reports and enforcement over HTTP', () => {
  let testApp: TestApp;
  let talentId: string;
  let agent: string;
  let moderator: string;

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: object) =>
    testApp.app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

  async function signUp(email: string): Promise<{ token: string; refreshToken: string }> {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: {
        email,
        password: PASSWORD,
        dateOfBirth: '1996-01-30',
        countryCode: 'NG',
        acceptedTerms: true,
        deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a21',
      },
    });
    const { tokens } = response.json<{ tokens: { accessToken: string; refreshToken: string } }>();
    await testApp.deliverEvents();
    await call('POST', '/v1/auth/verify-email', tokens.accessToken, {
      code: testApp.email.lastCodeFor(email),
    });
    return { token: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  const accounts = () => testApp.moduleRef.get<AccountsFacade>(ACCOUNTS.Facade);
  let talentRefresh: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    const talent = await signUp('dayo.guitar@example.com');
    talentRefresh = talent.refreshToken;
    await call('POST', '/v1/me/role', talent.token, { role: 'talent' });
    const step = await call('PATCH', '/v1/me/talent-profile', talent.token, {
      displayName: 'Dayo Ajayi',
      handle: 'dayo.guitar',
      categorySlug: 'sports',
      subcategorySlugs: ['athletics'],
      citySlug: 'ng-lagos',
      bio: BIO,
    });
    talentId = step.json<MyTalentProfile>().userId;
    const profile = await testApp.talentProfiles.findByUserId(talentId);
    if (!profile) throw new Error('profile missing');
    profile.setApprovedAvatar('0192a3b4-0000-7000-8000-0000000000bb', new Date());
    await testApp.talentProfiles.save(profile);
    await accounts().completeOnboarding(talentId);

    agent = (await signUp('scout.ibadan@example.com')).token;
    await call('POST', '/v1/me/role', agent, { role: 'agent' });
    moderator = (await signUp('moderator.two@raisingtalents.app')).token;
    await accounts().grantStaffRole('moderator.two@raisingtalents.app', 'moderator');
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('takes a report, shows it to moderators only, and suspends the account', async () => {
    const report = await call('POST', '/v1/reports', agent, {
      subject: { kind: 'talent', handle: 'DAYO.GUITAR' },
      category: 'fake_or_impersonation',
      note: 'Photos belong to a different musician',
    });
    expect(report.statusCode).toBe(204);
    const unknownField = await call('POST', '/v1/reports', agent, {
      subject: { kind: 'talent', handle: 'dayo.guitar' },
      category: 'other',
      reporter: 'someone',
    });
    expect(unknownField.statusCode).toBe(400);

    expect((await call('GET', '/v1/moderation/reports', agent)).statusCode).toBe(403);
    const queue = await call('GET', '/v1/moderation/reports', moderator);
    expect(queue.json<ReportQueuePage>().items).toMatchObject([
      {
        accountId: talentId,
        talent: { handle: 'dayo.guitar', displayName: 'Dayo Ajayi' },
        openReports: 1,
        categories: [{ category: 'fake_or_impersonation', count: 1 }],
      },
    ]);

    const decided = await call('POST', `/v1/moderation/reports/${talentId}/decision`, moderator, {
      decision: 'suspend',
      reason: 'fake_or_impersonation',
    });
    expect(decided.statusCode).toBe(204);
    const again = await call('POST', `/v1/moderation/reports/${talentId}/decision`, moderator, {
      decision: 'dismiss',
    });
    expect(again.json<ProblemDetails>().code).toBe('NOT_FOUND');

    // Hidden, signed out and unable to sign back in.
    expect((await call('GET', '/v1/talents/dayo.guitar', agent)).statusCode).toBe(404);
    const refresh = await testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: talentRefresh, deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a21' },
    });
    expect(refresh.statusCode).toBeGreaterThanOrEqual(400);
    const signIn = await testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      payload: {
        email: 'dayo.guitar@example.com',
        password: PASSWORD,
        deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a21',
      },
    });
    expect(signIn.json<ProblemDetails>().code).toBe('ACCOUNT_SUSPENDED');
  });
});
