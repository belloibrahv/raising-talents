import type {
  MyAgentProfile,
  MyTalentProfile,
  ProblemDetails,
  PublicTalentProfile,
  TaxonomyResponse,
} from '@rt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccountsFacade } from '../src/modules/accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../src/modules/accounts/application/accounts.tokens.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const BIO = 'Sprinter from Ikorodu. 100 m in 10.6 seconds, and training for the national trials.';

describe('Profiles over HTTP', () => {
  let testApp: TestApp;

  const call = (
    method: 'GET' | 'PATCH' | 'POST',
    url: string,
    token: string,
    payload?: object,
    headers: Record<string, string> = {},
  ) =>
    testApp.app.inject({
      method,
      url,
      payload,
      headers: { authorization: `Bearer ${token}`, ...headers },
    });

  /** Signs up, verifies the email from the captured message and chooses a role. */
  async function onboard(email: string, role: 'talent' | 'agent', verify = true): Promise<string> {
    const signUp = await testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: {
        email,
        password: 'relay-baton-ikorodu-26',
        dateOfBirth: '1999-03-08',
        countryCode: 'NG',
        acceptedTerms: true,
        deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b',
      },
    });
    const token = signUp.json<{ tokens: { accessToken: string } }>().tokens.accessToken;
    await testApp.deliverEvents();
    if (verify) {
      await call('POST', '/v1/auth/verify-email', token, {
        code: testApp.email.lastCodeFor(email),
      });
    }
    await call('POST', '/v1/me/role', token, { role });
    return token;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('serves the taxonomy for the onboarding pickers', async () => {
    const token = await onboard('bisi.adebayo@example.com', 'talent');
    const response = await call('GET', '/v1/taxonomy', token);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('max-age=3600');
    expect(response.json<TaxonomyResponse>().categories.map((category) => category.slug)).toEqual([
      'sports',
      'music',
    ]);
  });

  it('saves the talent wizard step by step with ETag and If-Match', async () => {
    const token = await onboard('femi.kolade@example.com', 'talent');

    const notStarted = await call('GET', '/v1/me/talent-profile', token);
    expect(notStarted.statusCode).toBe(404);

    const basics = await call('PATCH', '/v1/me/talent-profile', token, {
      displayName: 'Femi Kolade',
      categorySlug: 'sports',
      subcategorySlugs: ['athletics'],
    });
    expect(basics.statusCode).toBe(200);
    expect(basics.headers.etag).toBe('"1"');
    expect(basics.json<MyTalentProfile>()).toMatchObject({
      handle: 'femi.kolade',
      missing: ['city', 'bio', 'avatar'],
    });

    const withoutVersion = await call('PATCH', '/v1/me/talent-profile', token, {
      citySlug: 'ng-lagos',
    });
    expect(withoutVersion.statusCode).toBe(428);
    expect(withoutVersion.json<ProblemDetails>().code).toBe('PRECONDITION_REQUIRED');

    const stale = await call(
      'PATCH',
      '/v1/me/talent-profile',
      token,
      { citySlug: 'ng-lagos' },
      { 'if-match': '"9"' },
    );
    expect(stale.statusCode).toBe(412);

    const location = await call(
      'PATCH',
      '/v1/me/talent-profile',
      token,
      { citySlug: 'ng-lagos', bio: BIO },
      { 'if-match': basics.headers.etag as string },
    );
    expect(location.headers.etag).toBe('"2"');
    expect(location.json<MyTalentProfile>()).toMatchObject({
      city: { name: 'Lagos' },
      missing: ['avatar'],
      isComplete: false,
    });

    const reread = await call('GET', '/v1/me/talent-profile', token);
    expect(reread.headers.etag).toBe('"2"');
  });

  it('rejects unknown fields, bad handles and wrong taxonomy', async () => {
    const token = await onboard('ngozi.eze@example.com', 'talent');
    const unknownField = await call('PATCH', '/v1/me/talent-profile', token, {
      displayName: 'Ngozi',
      verifiedAt: '2026-01-01',
    });
    expect(unknownField.statusCode).toBe(400);

    const badHandle = await call('PATCH', '/v1/me/talent-profile', token, { handle: 'ng..ozi' });
    expect(badHandle.json<ProblemDetails>().fields?.[0]?.path).toBe('handle');

    const reserved = await call('PATCH', '/v1/me/talent-profile', token, {
      handle: 'raisingtalents',
    });
    expect(reserved.json<ProblemDetails>().code).toBe('HANDLE_INVALID');

    const wrongSub = await call('PATCH', '/v1/me/talent-profile', token, {
      categorySlug: 'music',
      subcategorySlugs: ['football'],
    });
    expect(wrongSub.statusCode).toBe(422);
    expect(wrongSub.json<ProblemDetails>().code).toBe('UNKNOWN_TAXONOMY');
  });

  it('hides incomplete profiles behind the same 404 as missing ones', async () => {
    const token = await onboard('kemi.lawal@example.com', 'talent');
    await call('PATCH', '/v1/me/talent-profile', token, {
      displayName: 'Kemi Lawal',
      handle: 'kemi.sprints',
    });
    const incomplete = await call('GET', '/v1/talents/kemi.sprints', token);
    const missing = await call('GET', '/v1/talents/nobody.here', token);
    expect(incomplete.statusCode).toBe(404);
    expect(incomplete.json<ProblemDetails>().detail).toBe(missing.json<ProblemDetails>().detail);
  });

  it('shows a complete profile to agents only once the account is active, with age and never the date of birth', async () => {
    const talentToken = await onboard('tobi.akinola@example.com', 'talent');
    const step = await call('PATCH', '/v1/me/talent-profile', talentToken, {
      displayName: 'Tobi Akinola',
      handle: 'tobi.runs',
      categorySlug: 'sports',
      subcategorySlugs: ['athletics'],
      skillSlugs: ['sprinting', 'yoruba'],
      citySlug: 'ng-lagos',
      bio: BIO,
    });
    const userId = step.json<MyTalentProfile>().userId;
    // Stand-in for the media module approving an uploaded avatar.
    const profile = await testApp.talentProfiles.findByUserId(userId);
    if (!profile) throw new Error('profile missing');
    profile.setApprovedAvatar('0192a3b4-0000-7000-8000-0000000000aa', new Date());
    await testApp.talentProfiles.save(profile);

    const agentToken = await onboard('scout.lagos@example.com', 'agent');
    const whileOnboarding = await call('GET', '/v1/talents/tobi.runs', agentToken);
    expect(whileOnboarding.statusCode).toBe(404);

    // The media module completes onboarding in the same step; done directly here.
    const completed = await testApp.moduleRef
      .get<AccountsFacade>(ACCOUNTS.Facade)
      .completeOnboarding(userId);
    expect(completed.ok).toBe(true);

    const visible = await call('GET', '/v1/talents/TOBI.RUNS', agentToken);
    expect(visible.statusCode).toBe(200);
    const view = visible.json<PublicTalentProfile>();
    expect(view).toMatchObject({
      displayName: 'Tobi Akinola',
      city: { name: 'Lagos' },
      skills: [{ name: 'Sprinting' }, { name: 'Yoruba' }],
    });
    expect(view.ageYears).toBeGreaterThanOrEqual(27);
    expect(visible.body).not.toContain('1999-03-08');
    expect(visible.body).not.toContain('dateOfBirth');
  });

  it('keeps a finished profile private until the email is verified (ADR-037)', async () => {
    const talentToken = await onboard('funke.unverified@example.com', 'talent', false);
    const step = await call('PATCH', '/v1/me/talent-profile', talentToken, {
      displayName: 'Funke Ade',
      handle: 'funke.sings',
      categorySlug: 'sports',
      subcategorySlugs: ['athletics'],
      citySlug: 'ng-lagos',
      bio: BIO,
    });
    expect(step.statusCode).toBe(200);
    const userId = step.json<MyTalentProfile>().userId;
    const profile = await testApp.talentProfiles.findByUserId(userId);
    if (!profile) throw new Error('profile missing');
    profile.setApprovedAvatar('0192a3b4-0000-7000-8000-0000000000ab', new Date());
    await testApp.talentProfiles.save(profile);
    await testApp.moduleRef.get<AccountsFacade>(ACCOUNTS.Facade).completeOnboarding(userId);

    const agentToken = await onboard('scout.ibadan2@example.com', 'agent');
    expect((await call('GET', '/v1/talents/funke.sings', agentToken)).statusCode).toBe(404);

    await call('POST', '/v1/auth/verify-email', talentToken, {
      code: testApp.email.lastCodeFor('funke.unverified@example.com'),
    });
    expect((await call('GET', '/v1/talents/funke.sings', agentToken)).statusCode).toBe(200);
  });

  it('completes agent onboarding and locks the role', async () => {
    const token = await onboard('aisha.bello@example.com', 'agent');
    const response = await call('PATCH', '/v1/me/agent-profile', token, {
      agencyName: 'Arewa Sports Management',
      jobTitle: 'Head scout',
      specializationSlugs: ['sports'],
      citySlug: 'ng-abuja',
      website: 'https://arewasports.example.com',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<MyAgentProfile>()).toMatchObject({
      isComplete: true,
      city: { name: 'Abuja' },
    });

    const me = await call('GET', '/v1/me', token);
    expect(me.json<{ status: string; roleLocked: boolean }>()).toMatchObject({
      status: 'active',
      roleLocked: true,
    });

    const roleChange = await call('POST', '/v1/me/role', token, { role: 'talent' });
    expect(roleChange.statusCode).toBe(409);

    const insecureSite = await call(
      'PATCH',
      '/v1/me/agent-profile',
      token,
      { website: 'http://arewasports.example.com' },
      { 'if-match': response.headers.etag as string },
    );
    expect(insecureSite.statusCode).toBe(400);
  });

  it('keeps each role out of the other profile', async () => {
    const agentToken = await onboard('wrong.door@example.com', 'agent');
    const response = await call('PATCH', '/v1/me/talent-profile', agentToken, {
      displayName: 'Not a talent',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json<ProblemDetails>().code).toBe('WRONG_ROLE');
  });
});
