import type {
  Comment,
  CommentPage,
  DataExport,
  MyPortfolio,
  MyTalentProfile,
  NotificationPage,
  Post,
  PostPage,
  ProblemDetails,
  ReportQueuePage,
  UploadIntentResponse,
} from '@rt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccountsFacade } from '../src/modules/accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../src/modules/accounts/application/accounts.tokens.js';
import { newId } from '../src/platform/ids.js';
import { COMMENTS } from '../src/modules/social/application/comments.use-cases.js';
import type { CommentRepository } from '../src/modules/social/domain/social.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const PASSWORD = 'relay-baton-ikorodu-26';
const BIO = 'Sprinter from Ibadan. National under-23 finalist, training for the next trials.';

describe('Comments over HTTP', () => {
  let testApp: TestApp;
  let tobi: string;
  let ngozi: string;
  let agent: string;
  let newcomer: string;
  let moderator: string;
  let agentId: string;
  let tobiId: string;
  let postId: string;
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
        deviceId: `0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5b${String(40 + device)}`,
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

  const comments = async (token: string, query = '') =>
    (await call('GET', `/v1/posts/${postId}/comments${query}`, token)).json<CommentPage>();
  const say = (token: string, body: string) =>
    call('POST', `/v1/posts/${postId}/comments`, token, { body });
  const accounts = () => testApp.moduleRef.get<AccountsFacade>(ACCOUNTS.Facade);

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
    moderator = await signUp('moderator.three@raisingtalents.app', 'talent');
    await accounts().grantStaffRole('moderator.three@raisingtalents.app', 'moderator');
    postId = await post(tobi, 'Heats at Teslim Balogun');
    tobiId = (await call('GET', '/v1/me/talent-profile', tobi)).json<MyTalentProfile>().userId;
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('lists comments newest first, with who wrote them and what the viewer may do', async () => {
    const first = await say(ngozi, '  Flying start!  ');
    expect(first.statusCode).toBe(201);
    expect(first.json<Comment>()).toMatchObject({
      body: 'Flying start!',
      mine: true,
      canDelete: true,
      author: { name: 'Ngozi Adeyemi', handle: 'ngozi.sings', agentId: null },
    });
    testApp.clock.advanceSeconds(30);
    await say(agent, 'We should talk after the trials.');

    const forAgent = await comments(agent);
    expect(forAgent.total).toBe(2);
    expect(forAgent.nextCursor).toBeNull();
    expect(forAgent.items).toMatchObject([
      {
        body: 'We should talk after the trials.',
        mine: true,
        canDelete: true,
        // Not verified yet, so there is no agent page to open.
        author: { name: 'Eko Talent Partners', handle: null, agentId: null, verified: false },
      },
      { body: 'Flying start!', mine: false, canDelete: false },
    ]);
    // The talent whose post it is can delete every comment on it.
    expect((await comments(tobi)).items.map((item) => item.canDelete)).toEqual([true, true]);

    const one = (await call('GET', `/v1/posts/${postId}`, agent)).json<Post>();
    expect(one).toMatchObject({ id: postId, comments: 2, caption: 'Heats at Teslim Balogun' });
    const feed = (await call('GET', '/v1/feed', ngozi)).json<PostPage>();
    expect(feed.items[0]).toMatchObject({ id: postId, comments: 2 });
  });

  it('tells the owner of the post in the app, once per comment, and not about their own', async () => {
    await say(tobi, 'Thank you both.');
    await testApp.deliverEvents();
    await testApp.deliverEvents();
    const inbox = (await call('GET', '/v1/me/notifications', tobi)).json<NotificationPage>();
    const notices = inbox.items.filter((notice) => notice.kind === 'post_commented');
    expect(notices).toHaveLength(2);
    expect(notices).toContainEqual(
      expect.objectContaining({ postId, commenterName: 'Eko Talent Partners' }),
    );
    expect(notices).toContainEqual(
      expect.objectContaining({ postId, commenterName: 'Ngozi Adeyemi' }),
    );
  });

  it('refuses empty and overlong comments, unknown posts, and people who have not finished setting up', async () => {
    expect((await say(ngozi, '   ')).statusCode).toBe(400);
    expect((await say(ngozi, 'a'.repeat(501))).statusCode).toBe(400);
    expect((await say(newcomer, 'Hello')).json<ProblemDetails>()).toMatchObject({
      code: 'FORBIDDEN',
    });
    expect((await call('GET', `/v1/posts/${postId}/comments`, newcomer)).statusCode).toBe(403);
    const missing = '/v1/posts/0192a3b4-0000-7000-8000-00000000dead';
    expect((await call('POST', `${missing}/comments`, ngozi, { body: 'Hi' })).statusCode).toBe(404);
    expect((await call('GET', `${missing}/comments`, ngozi)).statusCode).toBe(404);
    expect((await call('GET', missing, ngozi)).statusCode).toBe(404);
    // Moderators read and remove; they do not comment.
    expect((await say(moderator, 'Hello')).json<ProblemDetails>()).toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('lets the author, the owner of the post and a moderator delete, and nobody else', async () => {
    const byNgozi = (await say(ngozi, 'One')).json<Comment>();
    const byAgent = (await say(agent, 'Two')).json<Comment>();
    const again = (await say(agent, 'Three')).json<Comment>();

    const stranger = await call('DELETE', `/v1/comments/${byNgozi.id}`, agent);
    expect(stranger.json<ProblemDetails>()).toMatchObject({ code: 'FORBIDDEN' });
    expect((await call('DELETE', `/v1/comments/${byNgozi.id}`, ngozi)).statusCode).toBe(204);
    expect((await call('DELETE', `/v1/comments/${byAgent.id}`, tobi)).statusCode).toBe(204);
    expect((await comments(moderator)).items.every((item) => item.canDelete)).toBe(true);
    expect((await call('DELETE', `/v1/comments/${again.id}`, moderator)).statusCode).toBe(204);
    expect((await call('DELETE', `/v1/comments/${again.id}`, moderator)).statusCode).toBe(404);
    expect((await comments(tobi)).items.map((item) => item.body)).toEqual([
      'Thank you both.',
      'We should talk after the trials.',
      'Flying start!',
    ]);
  });

  it('pages twenty at a time', async () => {
    const other = await post(ngozi, 'Studio day');
    // Written straight to the store: one person may post ten comments a minute.
    const store = testApp.moduleRef.get<CommentRepository>(COMMENTS.Repository);
    for (let index = 0; index < 21; index += 1) {
      testApp.clock.advanceSeconds(10);
      await store.add({
        id: newId(),
        itemId: other,
        authorId: tobiId,
        body: `Note ${String(index + 1)}`,
        createdAt: testApp.clock.now(),
      });
    }
    const first = (await call('GET', `/v1/posts/${other}/comments`, agent)).json<CommentPage>();
    expect(first.items).toHaveLength(20);
    expect(first.items[0]?.body).toBe('Note 21');
    expect(first.total).toBe(21);
    const second = (
      await call('GET', `/v1/posts/${other}/comments?cursor=${first.nextCursor ?? ''}`, agent)
    ).json<CommentPage>();
    expect(second.items.map((item) => item.body)).toEqual(['Note 1']);
    expect(second.nextCursor).toBeNull();
  });

  it('takes a report about a comment to the moderators with the words, and lists your comments in your data', async () => {
    const [latest] = (await comments(ngozi)).items.filter(
      (item) => item.author.name === 'Eko Talent Partners',
    );
    if (!latest) throw new Error('no comment');
    const report = await call('POST', '/v1/reports', ngozi, {
      subject: { kind: 'comment', commentId: latest.id },
      category: 'scam_or_harassment',
    });
    expect(report.statusCode).toBe(204);
    const queue = (await call('GET', '/v1/moderation/reports', moderator)).json<ReportQueuePage>();
    expect(queue.items).toMatchObject([
      { accountId: agentId, evidence: [{ body: 'We should talk after the trials.' }] },
    ]);

    const exported = (await call('GET', '/v1/me/export', agent)).json<DataExport>();
    expect(exported.comments).toEqual([
      { body: 'We should talk after the trials.', postedAt: expect.any(String) as string },
    ]);
  });

  it('hides what a suspended member wrote', async () => {
    await accounts().restrict(agentId, 'suspend', 'scam_or_harassment');
    expect((await comments(tobi)).items.map((item) => item.author.name)).not.toContain(
      'Eko Talent Partners',
    );
  });
});
