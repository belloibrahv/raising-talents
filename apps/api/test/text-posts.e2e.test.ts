import type {
  MyPortfolio,
  MyTalentProfile,
  PostPage,
  ProblemDetails,
  ReportQueuePage,
  UploadIntentResponse,
} from '@rt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccountsFacade } from '../src/modules/accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../src/modules/accounts/application/accounts.tokens.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const PASSWORD = 'relay-baton-ikorodu-26';
const BIO = 'Sprinter from Ibadan. National under-23 finalist, training for the next trials.';

describe('Text posts over HTTP', () => {
  let testApp: TestApp;
  let tobi: string;
  let ngozi: string;
  let agent: string;
  let newcomer: string;
  let moderator: string;
  let agentId: string;
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
        deviceId: `0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5c${String(40 + device)}`,
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

  const accounts = () => testApp.moduleRef.get<AccountsFacade>(ACCOUNTS.Facade);
  const write = (token: string, text: string) =>
    call('POST', '/v1/me/portfolio/texts', token, { text });
  const feed = async (token: string) => (await call('GET', '/v1/feed', token)).json<PostPage>();

  beforeAll(async () => {
    testApp = await createTestApp();
    tobi = await talent('tobi.sprint@example.com', 'tobi.sprint', 'Tobi Adebayo');
    ngozi = await talent('ngozi.sings@example.com', 'ngozi.sings', 'Ngozi Adeyemi');
    agent = await signUp('scout.eko@example.com', 'agent');
    const profile = await call('PATCH', '/v1/me/agent-profile', agent, {
      agencyName: 'Eko Talent Partners',
      jobTitle: 'Scout',
      specializationSlugs: ['sports'],
      citySlug: 'ng-lagos',
    });
    agentId = profile.json<{ userId: string }>().userId;
    newcomer = await signUp('new.face@example.com', 'talent');
    moderator = await signUp('moderator.four@raisingtalents.app', 'talent');
    await accounts().grantStaffRole('moderator.four@raisingtalents.app', 'moderator');
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('posts words on their own, live at once, in the feed and on the profile', async () => {
    const photo = await post(tobi, 'Heats at Teslim Balogun');
    const written = await write(tobi, '  Trials are on Saturday. Wish me luck.  ');
    expect(written.statusCode).toBe(201);
    const mine = written.json<MyPortfolio>();
    expect(mine.items.at(-1)).toMatchObject({
      kind: 'text',
      mediaId: null,
      mediaStatus: 'ready',
      caption: 'Trials are on Saturday. Wish me luck.',
      urls: null,
    });
    const textId = mine.items.at(-1)?.id ?? '';

    const page = await feed(agent);
    expect(page.items.map((item) => item.id)).toEqual([textId, photo]);
    expect(page.items[0]).toMatchObject({
      kind: 'text',
      mediaId: null,
      caption: 'Trials are on Saturday. Wish me luck.',
      talent: { handle: 'tobi.sprint' },
      likes: 0,
      comments: 0,
    });
    const onProfile = (await call('GET', '/v1/talents/tobi.sprint/posts', agent)).json<PostPage>();
    expect(onProfile.items.map((item) => item.kind)).toEqual(['text', 'image']);
    const shown = (await call('GET', '/v1/talents/tobi.sprint/portfolio', agent)).json<{
      items: { kind: string }[];
    }>();
    expect(shown.items.map((item) => item.kind)).toEqual(['image', 'text']);

    // It can be liked and commented on like any post.
    expect((await call('PUT', `/v1/posts/${textId}/like`, agent)).statusCode).toBe(200);
    expect(
      (await call('POST', `/v1/posts/${textId}/comments`, ngozi, { body: 'Go well!' })).statusCode,
    ).toBe(201);
    expect((await feed(ngozi)).items[0]).toMatchObject({ likes: 1, comments: 1 });
  });

  it('refuses empty and overlong text, agents, and emptying a text post', async () => {
    expect((await write(tobi, '   ')).statusCode).toBe(400);
    expect((await write(tobi, 'a'.repeat(501))).statusCode).toBe(400);
    expect((await write(agent, 'Hello')).json<ProblemDetails>()).toMatchObject({
      code: 'WRONG_ROLE',
    });
    expect((await write(newcomer, 'Hello')).statusCode).toBe(201);

    const mine = (await call('GET', '/v1/me/portfolio', tobi)).json<MyPortfolio>();
    const text = mine.items.find((item) => item.kind === 'text');
    const photo = mine.items.find((item) => item.kind === 'image');
    if (!text || !photo) throw new Error('items missing');
    const emptied = await call('PATCH', `/v1/me/portfolio/items/${text.id}`, tobi, { caption: '' });
    expect(emptied.statusCode).toBe(400);
    const edited = await call('PATCH', `/v1/me/portfolio/items/${text.id}`, tobi, {
      caption: 'Trials moved to Sunday.',
    });
    expect(edited.statusCode).toBe(200);
    // A caption on a photo stays within its own, shorter limit.
    const long = await call('PATCH', `/v1/me/portfolio/items/${photo.id}`, tobi, {
      caption: 'a'.repeat(301),
    });
    expect(long.statusCode).toBe(400);
  });

  it('shows a reported text post to moderators with its words, and lets them take it down', async () => {
    const [latest] = (await feed(agent)).items;
    if (latest?.kind !== 'text') throw new Error('no text post');
    const report = await call('POST', '/v1/reports', agent, {
      subject: { kind: 'post', postId: latest.id },
      category: 'other',
    });
    expect(report.statusCode).toBe(204);
    const queue = (await call('GET', '/v1/moderation/reports', moderator)).json<ReportQueuePage>();
    expect(queue.items[0]).toMatchObject({
      reportedMedia: [],
      evidence: [{ body: 'Trials moved to Sunday.' }],
    });

    const removal = `/v1/moderation/posts/${latest.id}/removal`;
    expect((await call('POST', removal, agent)).json<ProblemDetails>()).toMatchObject({
      code: 'FORBIDDEN',
    });
    expect((await call('POST', removal, moderator)).statusCode).toBe(204);
    expect((await call('POST', removal, moderator)).statusCode).toBe(404);
    expect((await feed(agent)).items.map((item) => item.kind)).toEqual(['image']);

    // A post with a photo is taken down through the photo, not here.
    const [photo] = (await feed(agent)).items;
    const wrong = await call('POST', `/v1/moderation/posts/${photo?.id ?? ''}/removal`, moderator);
    expect(wrong.json<ProblemDetails>()).toMatchObject({ code: 'CONFLICT' });
    expect(agentId).toBeTruthy();
  });

  it('removes a text post when its owner deletes it', async () => {
    const written = (await write(ngozi, 'New single out on Friday.')).json<MyPortfolio>();
    const id = written.items.at(-1)?.id ?? '';
    expect((await feed(agent)).items[0]?.id).toBe(id);
    expect((await call('DELETE', `/v1/me/portfolio/items/${id}`, ngozi)).statusCode).toBe(200);
    expect((await feed(agent)).items.map((item) => item.id)).not.toContain(id);
  });
});
