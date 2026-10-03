import type {
  DataExport,
  MyTalentProfile,
  ProblemDetails,
  ShortlistEntry,
  ShortlistPage,
} from '@rt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccountsFacade } from '../src/modules/accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../src/modules/accounts/application/accounts.tokens.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const PASSWORD = 'relay-baton-ikorodu-26';
const BIO =
  'Afrobeats dancer from Port Harcourt. Two music videos and a national competition final.';

describe('Shortlist over HTTP', () => {
  let testApp: TestApp;
  let agent: string;
  let talent: string;

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    token: string,
    payload?: object,
  ) => testApp.app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

  async function signUp(email: string, role: 'talent' | 'agent'): Promise<string> {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: {
        email,
        password: PASSWORD,
        dateOfBirth: '1998-08-14',
        countryCode: 'NG',
        acceptedTerms: true,
        deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a31',
      },
    });
    const token = response.json<{ tokens: { accessToken: string } }>().tokens.accessToken;
    await testApp.deliverEvents();
    await call('POST', '/v1/auth/verify-email', token, { code: testApp.email.lastCodeFor(email) });
    await call('POST', '/v1/me/role', token, { role });
    return token;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    talent = await signUp('ngozi.dance@example.com', 'talent');
    const step = await call('PATCH', '/v1/me/talent-profile', talent, {
      displayName: 'Ngozi Eke',
      handle: 'ngozi.dance',
      categorySlug: 'sports',
      subcategorySlugs: ['athletics'],
      citySlug: 'ng-lagos',
      bio: BIO,
    });
    const userId = step.json<MyTalentProfile>().userId;
    const profile = await testApp.talentProfiles.findByUserId(userId);
    if (!profile) throw new Error('profile missing');
    profile.setApprovedAvatar('0192a3b4-0000-7000-8000-0000000000cc', new Date());
    await testApp.talentProfiles.save(profile);
    await testApp.moduleRef.get<AccountsFacade>(ACCOUNTS.Facade).completeOnboarding(userId);

    agent = await signUp('scout.ph@example.com', 'agent');
    await call('PATCH', '/v1/me/agent-profile', agent, {
      agencyName: 'Garden City Talent',
      jobTitle: 'Scout',
      specializationSlugs: ['sports'],
      citySlug: 'ng-lagos',
    });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('saves with a note, reads it back, lists it, exports it and removes it', async () => {
    expect((await call('GET', '/v1/me/shortlist/ngozi.dance', agent)).statusCode).toBe(404);
    const saved = await call('PUT', '/v1/me/shortlist/ngozi.dance', agent, {
      note: 'Great energy',
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json<ShortlistEntry>()).toMatchObject({
      note: 'Great energy',
      talent: { handle: 'ngozi.dance', displayName: 'Ngozi Eke' },
    });
    expect((await call('GET', '/v1/me/shortlist/ngozi.dance', agent)).statusCode).toBe(200);
    const page = (await call('GET', '/v1/me/shortlist', agent)).json<ShortlistPage>();
    expect(page).toMatchObject({ saved: 1, items: [{ note: 'Great energy' }] });

    const exported = (await call('GET', '/v1/me/export', agent)).json<DataExport>();
    expect(exported.shortlist).toEqual([
      { handle: 'ngozi.dance', note: 'Great energy', savedAt: expect.any(String) as string },
    ]);

    expect((await call('DELETE', '/v1/me/shortlist/ngozi.dance', agent)).statusCode).toBe(204);
    expect((await call('DELETE', '/v1/me/shortlist/ngozi.dance', agent)).statusCode).toBe(204);
    expect((await call('GET', '/v1/me/shortlist', agent)).json<ShortlistPage>().saved).toBe(0);
  });

  it('keeps talent out and checks the note length', async () => {
    const asTalent = await call('GET', '/v1/me/shortlist', talent);
    expect(asTalent.json<ProblemDetails>().code).toBe('WRONG_ROLE');
    const long = await call('PUT', '/v1/me/shortlist/ngozi.dance', agent, {
      note: 'x'.repeat(501),
    });
    expect(long.statusCode).toBe(400);
  });
});
