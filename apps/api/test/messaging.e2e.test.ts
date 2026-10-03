import type {
  ConversationPage,
  ConversationSummary,
  DataExport,
  Message,
  MessagePage,
  MyAgentProfile,
  MyTalentProfile,
  NotificationPage,
  ProblemDetails,
} from '@rt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccountsFacade } from '../src/modules/accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../src/modules/accounts/application/accounts.tokens.js';
import { createTestApp, type TestApp } from './support/create-test-app.js';

const PASSWORD = 'relay-baton-ikorodu-26';
const BIO = 'Highlife guitarist from Enugu. Session player on two albums and a Felabration stage.';
const INTRO =
  'Good afternoon Chidi. We book session players for Lagos studios and would love to hear more.';
const ids = {
  intro: '0192a3b4-0000-7000-8000-00000000b001',
  reply: '0192a3b4-0000-7000-8000-00000000b002',
  second: '0192a3b4-0000-7000-8000-00000000b003',
};

describe('Contact requests and chat over HTTP (ADR-038)', () => {
  let testApp: TestApp;
  let agent: string;
  let talent: string;
  let agentId: string;

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
        dateOfBirth: '1996-02-11',
        countryCode: 'NG',
        acceptedTerms: true,
        deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a41',
      },
    });
    const token = response.json<{ tokens: { accessToken: string } }>().tokens.accessToken;
    await testApp.deliverEvents();
    await call('POST', '/v1/auth/verify-email', token, { code: testApp.email.lastCodeFor(email) });
    await call('POST', '/v1/me/role', token, { role });
    return token;
  }

  const ask = (token = agent, clientMessageId = ids.intro) =>
    call('POST', '/v1/talents/chidi.strings/contact', token, {
      message: INTRO,
      clientMessageId,
    });

  beforeAll(async () => {
    testApp = await createTestApp();
    talent = await signUp('chidi.strings@example.com', 'talent');
    const step = await call('PATCH', '/v1/me/talent-profile', talent, {
      displayName: 'Chidi Okoro',
      handle: 'chidi.strings',
      categorySlug: 'music',
      subcategorySlugs: ['singer'],
      citySlug: 'ng-lagos',
      bio: BIO,
    });
    const talentId = step.json<MyTalentProfile>().userId;
    const profile = await testApp.talentProfiles.findByUserId(talentId);
    if (!profile) throw new Error('profile missing');
    profile.setApprovedAvatar('0192a3b4-0000-7000-8000-0000000000dd', new Date());
    await testApp.talentProfiles.save(profile);
    await testApp.moduleRef.get<AccountsFacade>(ACCOUNTS.Facade).completeOnboarding(talentId);

    agent = await signUp('booker@lagos-sessions.example', 'agent');
    const agentProfile = await call('PATCH', '/v1/me/agent-profile', agent, {
      agencyName: 'Lagos Sessions',
      jobTitle: 'Booker',
      specializationSlugs: ['music'],
      citySlug: 'ng-lagos',
    });
    agentId = agentProfile.json<MyAgentProfile>().userId;
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('refuses an agent whose agency is not verified yet', async () => {
    const response = await ask();
    expect(response.statusCode).toBe(403);
    expect(response.json<ProblemDetails>().code).toBe('AGENT_NOT_VERIFIED');
  });

  it('runs the whole journey: request, notice, accept, chat, read, export', async () => {
    const profile = await testApp.agentProfiles.findByUserId(agentId);
    if (!profile) throw new Error('agent profile missing');
    profile.markVerified(new Date());
    await testApp.agentProfiles.save(profile);

    const asked = await ask();
    expect(asked.statusCode).toBe(201);
    const conversation = asked.json<ConversationSummary>();
    expect(conversation).toMatchObject({
      status: 'requested',
      counterpart: { kind: 'talent', handle: 'chidi.strings', displayName: 'Chidi Okoro' },
    });
    expect((await ask()).json<ConversationSummary>().id).toBe(conversation.id);
    expect((await ask(agent, ids.second)).json<ProblemDetails>().code).toBe(
      'CONTACT_REQUEST_PENDING',
    );

    await testApp.deliverEvents();
    const email = testApp.email.sent.findLast(
      (message) => message.to === 'chidi.strings@example.com',
    );
    expect(email?.subject).toBe('Lagos Sessions would like to contact you');
    expect(email?.text).not.toContain(INTRO);
    const notices = (await call('GET', '/v1/me/notifications', talent)).json<NotificationPage>();
    expect(notices.items[0]).toMatchObject({
      kind: 'contact_requested',
      conversationId: conversation.id,
      agencyName: 'Lagos Sessions',
    });
    expect((await call('GET', '/v1/me/conversations/unread', talent)).json()).toEqual({
      unread: 1,
    });

    const closed = await call('POST', `/v1/me/conversations/${conversation.id}/messages`, agent, {
      body: 'Following up!',
      clientMessageId: ids.second,
    });
    expect(closed.json<ProblemDetails>().code).toBe('CONVERSATION_CLOSED');

    const accepted = await call(
      'POST',
      `/v1/me/conversations/${conversation.id}/response`,
      talent,
      {
        decision: 'accept',
      },
    );
    expect(accepted.json<ConversationSummary>()).toMatchObject({
      status: 'accepted',
      canSend: true,
      counterpart: { kind: 'agent', agencyName: 'Lagos Sessions', verified: true },
    });

    testApp.clock.advanceSeconds(5);
    const reply = await call('POST', `/v1/me/conversations/${conversation.id}/messages`, talent, {
      body: 'Thanks! Here is my availability for March.',
      clientMessageId: ids.reply,
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json<Message>()).toMatchObject({ mine: true });

    const list = (await call('GET', '/v1/me/conversations', agent)).json<ConversationPage>();
    expect(list.items[0]).toMatchObject({ id: conversation.id, unread: 1 });
    const thread = (
      await call('GET', `/v1/me/conversations/${conversation.id}/messages`, agent)
    ).json<MessagePage>();
    expect(thread.items.map((message) => message.mine)).toEqual([false, true]);
    expect(
      (await call('POST', `/v1/me/conversations/${conversation.id}/read`, agent)).statusCode,
    ).toBe(204);
    expect((await call('GET', '/v1/me/conversations/unread', agent)).json()).toEqual({ unread: 0 });
    expect(
      (
        await call('GET', '/v1/me/conversations/with/chidi.strings', agent)
      ).json<ConversationSummary>().id,
    ).toBe(conversation.id);

    const exported = (await call('GET', '/v1/me/export', talent)).json<DataExport>();
    expect(exported.conversations).toEqual([
      expect.objectContaining({
        with: 'Lagos Sessions',
        status: 'accepted',
        messagesFromOthers: 1,
        myMessages: [
          expect.objectContaining({ body: 'Thanks! Here is my availability for March.' }),
        ],
      }),
    ]);
  });

  it('keeps other people out with the same 404 as a missing conversation', async () => {
    const outsider = await signUp('someone.else@example.com', 'talent');
    const list = (await call('GET', '/v1/me/conversations', agent)).json<ConversationPage>();
    const id = list.items[0]?.id ?? '';
    expect((await call('GET', `/v1/me/conversations/${id}`, outsider)).statusCode).toBe(404);
    expect(
      (await call('GET', '/v1/me/conversations/0192a3b4-0000-7000-8000-000000000000', agent))
        .statusCode,
    ).toBe(404);
    expect((await call('GET', '/v1/me/conversations/not-a-uuid', agent)).statusCode).toBe(400);
  });
});
