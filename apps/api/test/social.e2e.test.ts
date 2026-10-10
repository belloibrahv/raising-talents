import type {
  DataExport,
  LikeState,
  MyPortfolio,
  MyTalentProfile,
  NotificationPage,
  PostPage,
  ProblemDetails,
  Suggestions,
  TalentCardPage,
  TalentSearchResponse,
  TalentSocial,
  UploadIntentResponse,
} from '@rt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccountsFacade } from '../src/modules/accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../src/modules/accounts/application/accounts.tokens.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const PASSWORD = 'relay-baton-ikorodu-26';
const BIO = 'Sprinter from Ibadan. National under-23 finalist, training for the next trials.';

describe('Following, likes and the feed over HTTP', () => {
  let testApp: TestApp;
  let tobi: string;
  let ngozi: string;
  let agent: string;
  let newcomer: string;
  let device = 0;

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    token: string,
    payload?: object,
  ) => testApp.app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

  async function signUp(email: string, role: 'talent' | 'agent'): Promise<string> {
    device += 1;
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: {
        email,
        password: PASSWORD,
        dateOfBirth: '1998-08-14',
        countryCode: 'NG',
        acceptedTerms: true,
        deviceId: `0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a${String(40 + device)}`,
      },
    });
    const token = response.json<{ tokens: { accessToken: string } }>().tokens.accessToken;
    await testApp.deliverEvents();
    await call('POST', '/v1/auth/verify-email', token, { code: testApp.email.lastCodeFor(email) });
    await call('POST', '/v1/me/role', token, { role });
    return token;
  }

  /** A talent others can see: every step filled in and a photo approved. */
  async function talent(email: string, handle: string, displayName: string): Promise<string> {
    const token = await signUp(email, 'talent');
    const step = await call('PATCH', '/v1/me/talent-profile', token, {
      displayName,
      handle,
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
    return token;
  }

  /** Uploads a photo and adds it to the portfolio; the worker then makes it ready. */
  async function post(token: string, caption: string): Promise<string> {
    const intent = await call('POST', '/v1/media/upload-intents', token, {
      purpose: 'portfolio',
      contentType: 'image/jpeg',
      bytes: 1_500_000,
    });
    const { mediaId, upload } = intent.json<UploadIntentResponse>();
    testApp.storage.simulateUpload(upload.fields['key'] ?? '', Buffer.from('jpeg'), 'image/jpeg');
    await call('POST', `/v1/media/${mediaId}/complete`, token);
    const added = await call('POST', '/v1/me/portfolio/items', token, { mediaId, caption });
    await testApp.deliverEvents();
    testApp.clock.advanceSeconds(60);
    const item = added.json<MyPortfolio>().items.find((entry) => entry.mediaId === mediaId);
    if (!item) throw new Error('item missing');
    return item.id;
  }

  const feed = async (token: string, query = '') =>
    (await call('GET', `/v1/feed${query}`, token)).json<PostPage>();

  beforeAll(async () => {
    testApp = await createTestApp();
    tobi = await talent('tobi.sprint@example.com', 'tobi.sprint', 'Tobi Adebayo');
    ngozi = await talent('ngozi.sings@example.com', 'ngozi.sings', 'Ngozi Adeyemi');
    agent = await signUp('scout.eko@example.com', 'agent');
    await call('PATCH', '/v1/me/agent-profile', agent, {
      agencyName: 'Eko Talent Partners',
      jobTitle: 'Scout',
      specializationSlugs: ['sports'],
      citySlug: 'ng-lagos',
    });
    newcomer = await signUp('new.face@example.com', 'talent');
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('shows everyone the newest work first, with who posted it', async () => {
    const first = await post(tobi, 'Heats at Teslim Balogun');
    const second = await post(ngozi, 'Studio day');
    const page = await feed(agent);
    expect(page.items.map((item) => item.id)).toEqual([second, first]);
    expect(page.items[0]).toMatchObject({
      kind: 'image',
      caption: 'Studio day',
      likes: 0,
      liked: false,
      talent: { handle: 'ngozi.sings', displayName: 'Ngozi Adeyemi' },
    });
    expect(page.nextCursor).toBeNull();
  });

  it('keeps the following feed to talent the viewer follows', async () => {
    expect((await feed(agent, '?scope=following')).items).toEqual([]);

    const followed = await call('PUT', '/v1/talents/tobi.sprint/follow', agent);
    expect(followed.statusCode).toBe(200);
    expect(followed.json<TalentSocial>()).toEqual({
      followers: 1,
      following: 0,
      posts: 1,
      followedByViewer: true,
      isSelf: false,
    });
    // Following twice changes nothing.
    await call('PUT', '/v1/talents/tobi.sprint/follow', agent);
    expect(
      (await call('GET', '/v1/talents/tobi.sprint/social', agent)).json<TalentSocial>().followers,
    ).toBe(1);

    const following = await feed(agent, '?scope=following');
    expect(following.items.map((item) => item.talent.handle)).toEqual(['tobi.sprint']);
    const list = (await call('GET', '/v1/me/following', agent)).json<TalentCardPage>();
    expect(list.items.map((card) => card.handle)).toEqual(['tobi.sprint']);
  });

  it('tells the talent once, in the app, who followed them', async () => {
    await testApp.deliverEvents();
    const inbox = (await call('GET', '/v1/me/notifications', tobi)).json<NotificationPage>();
    expect(inbox.items.filter((notice) => notice.kind === 'new_follower')).toEqual([
      expect.objectContaining({ followerName: 'Eko Talent Partners', followerHandle: null }),
    ]);

    // Talent follow each other too, and are named with their page.
    await call('PUT', '/v1/talents/tobi.sprint/follow', ngozi);
    await call('DELETE', '/v1/talents/tobi.sprint/follow', ngozi);
    await call('PUT', '/v1/talents/tobi.sprint/follow', ngozi);
    await testApp.deliverEvents();
    const again = (await call('GET', '/v1/me/notifications', tobi)).json<NotificationPage>();
    expect(
      again.items.filter(
        (notice) => notice.kind === 'new_follower' && notice.followerHandle === 'ngozi.sings',
      ),
    ).toHaveLength(1);
  });

  it('suggests talent the viewer does not follow, and never the viewer', async () => {
    const forAgent = (await call('GET', '/v1/feed/suggestions', agent)).json<Suggestions>();
    expect(forAgent.items.map((card) => card.handle)).toEqual(['ngozi.sings']);
    const forNgozi = (await call('GET', '/v1/feed/suggestions', ngozi)).json<Suggestions>();
    expect(forNgozi.items).toEqual([]);
  });

  it('refuses following yourself, a hidden profile, or before setup is finished', async () => {
    const self = await call('PUT', '/v1/talents/tobi.sprint/follow', tobi);
    expect(self.json<ProblemDetails>()).toMatchObject({ code: 'FORBIDDEN' });
    expect((await call('PUT', '/v1/talents/nobody.here/follow', agent)).statusCode).toBe(404);
    const early = await call('PUT', '/v1/talents/tobi.sprint/follow', newcomer);
    expect(early.json<ProblemDetails>()).toMatchObject({ code: 'FORBIDDEN' });
    expect((await call('GET', '/v1/feed', newcomer)).statusCode).toBe(403);
  });

  it('counts likes per person, and shows each viewer their own', async () => {
    const [latest] = (await feed(agent)).items;
    if (!latest) throw new Error('no posts');
    const liked = await call('PUT', `/v1/posts/${latest.id}/like`, agent);
    expect(liked.json<LikeState>()).toEqual({ liked: true, likes: 1 });
    await call('PUT', `/v1/posts/${latest.id}/like`, agent);
    const byTobi = await call('PUT', `/v1/posts/${latest.id}/like`, tobi);
    expect(byTobi.json<LikeState>()).toEqual({ liked: true, likes: 2 });

    const posts = (await call('GET', '/v1/talents/ngozi.sings/posts', agent)).json<PostPage>();
    expect(posts.items[0]).toMatchObject({ id: latest.id, likes: 2, liked: true });
    const forNgozi = (await call('GET', '/v1/talents/ngozi.sings/posts', ngozi)).json<PostPage>();
    expect(forNgozi.items[0]).toMatchObject({ likes: 2, liked: false });

    const unliked = await call('DELETE', `/v1/posts/${latest.id}/like`, agent);
    expect(unliked.json<LikeState>()).toEqual({ liked: false, likes: 1 });
    const missing = await call('PUT', '/v1/posts/0192a3b4-0000-7000-8000-00000000dead/like', agent);
    expect(missing.statusCode).toBe(404);
  });

  it('pages the feed twelve at a time', async () => {
    for (let index = 0; index < 12; index += 1) await post(tobi, `Session ${String(index + 1)}`);
    const first = await feed(agent);
    expect(first.items).toHaveLength(12);
    expect(first.items[0]?.caption).toBe('Session 12');
    expect(first.nextCursor).not.toBeNull();
    const second = await feed(agent, `?cursor=${first.nextCursor ?? ''}`);
    expect(second.items.map((item) => item.caption)).toEqual([
      'Studio day',
      'Heats at Teslim Balogun',
    ]);
    expect(second.nextCursor).toBeNull();
  });

  it('lets talent search for each other, and lists who you follow in your data', async () => {
    const found = await call('GET', '/v1/search/talents', ngozi);
    // Search runs on Typesense, which the tests do not start; the role is what matters here.
    expect(found.json<ProblemDetails | TalentSearchResponse>()).not.toMatchObject({
      code: 'WRONG_ROLE',
    });
    const exported = (await call('GET', '/v1/me/export', agent)).json<DataExport>();
    expect(exported.following).toEqual([
      { handle: 'tobi.sprint', followedAt: expect.any(String) as string },
    ]);
  });

  it('drops a talent from every feed once they are hidden', async () => {
    const everything = async () => {
      const first = await feed(agent);
      const second = await feed(agent, `?cursor=${first.nextCursor ?? ''}`);
      return [...first.items, ...second.items].map((item) => item.talent.handle);
    };
    expect(await everything()).toContain('ngozi.sings');
    await call('POST', '/v1/me/deletion', ngozi, { password: PASSWORD });
    expect(await everything()).not.toContain('ngozi.sings');
    expect((await call('GET', '/v1/talents/ngozi.sings/posts', agent)).statusCode).toBe(404);
  });
});
