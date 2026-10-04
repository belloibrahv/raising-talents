import type { ConversationSummary, MyAgentVerification } from '@rt/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  expectNoAxeViolations,
  meFor,
  problem,
  renderAt,
  resetSession,
  signedIn,
  stubApi,
} from '../../test/app-harness';

const talent = meFor({ role: 'talent', status: 'active' });
const agent = meFor({ role: 'agent', status: 'active', email: 'tunde@eko-talent.example' });
const ID = '0192a3b4-0000-7000-8000-0000000000c1';
const INTRO = 'Hello Ngozi, I scout singers for Eko Talent Partners and loved your showcase.';

const agentSide = {
  kind: 'agent' as const,
  agencyName: 'Eko Talent Partners',
  jobTitle: 'Talent scout',
  city: 'Lagos',
  verified: true,
};
const talentSide = {
  kind: 'talent' as const,
  handle: 'ada.sings',
  displayName: 'Ada Nwosu',
  avatarUrls: null,
  available: true,
};
const intro = (mine: boolean) => ({
  id: '0192a3b4-0000-7000-8000-0000000000d1',
  mine,
  body: INTRO,
  sentAt: '2026-10-03T09:00:00.000Z',
});

const summary = (overrides: Partial<ConversationSummary>): ConversationSummary => ({
  id: ID,
  status: 'requested',
  counterpart: agentSide,
  lastMessage: intro(false),
  unread: 1,
  canSend: false,
  awaitingMyAnswer: true,
  blockedByMe: false,
  requestedAt: '2026-10-03T09:00:00.000Z',
  updatedAt: '2026-10-03T09:00:00.000Z',
  ...overrides,
});

const profile = {
  handle: 'ada.sings',
  displayName: 'Ada Nwosu',
  category: { slug: 'music', name: 'Music' },
  subcategories: [{ slug: 'singer', name: 'Singer' }],
  city: { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
  ageYears: 24,
  verified: true,
  avatarUrls: null,
  bio: 'Soul singer from Yaba.',
  skills: [],
  gender: null,
  avatarMediaId: null,
};

const verification = (state: MyAgentVerification['state']): MyAgentVerification => ({
  state,
  declineReason: null,
  submittedAt: null,
  canRequest: state === 'not_requested',
});

describe('messages', () => {
  beforeEach(resetSession);

  it('shows a talent the request, and opens chat when they accept', async () => {
    let current = summary({});
    let thread = [intro(false)];
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(talent),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations/unread': () =>
        Response.json({ unread: current.awaitingMyAnswer ? 1 : 0 }),
      'GET /v1/me/conversations': () => Response.json({ items: [current], nextCursor: null }),
      [`GET /v1/me/conversations/${ID}`]: () => Response.json(current),
      [`GET /v1/me/conversations/${ID}/messages`]: () =>
        Response.json({ items: [...thread].reverse(), nextCursor: null }),
      [`POST /v1/me/conversations/${ID}/read`]: () => {
        current = { ...current, unread: 0 };
        return new Response(null, { status: 204 });
      },
      [`POST /v1/me/conversations/${ID}/response`]: () => {
        current = { ...current, status: 'accepted', awaitingMyAnswer: false, canSend: true };
        return Response.json(current);
      },
      [`POST /v1/me/conversations/${ID}/messages`]: (call) => {
        const sent = {
          id: '0192a3b4-0000-7000-8000-0000000000d2',
          mine: true,
          body: (call.body as { body: string }).body,
          sentAt: '2026-10-03T09:05:00.000Z',
        };
        thread = [...thread, sent];
        return Response.json(sent, { status: 201 });
      },
    });
    renderAt('/messages');
    const user = userEvent.setup({ delay: null });
    expect(
      await screen.findByRole('link', { name: 'Messages, 1 need your attention' }),
    ).toBeVisible();
    const row = await screen.findByRole('link', { name: /Eko Talent Partners/ });
    expect(row).toHaveTextContent('Request');
    expect(row).toHaveTextContent('1 unread');
    await expectNoAxeViolations();

    await user.click(row);
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Eko Talent Partners would like to contact you',
      }),
    ).toBeVisible();
    expect(screen.getByRole('log')).toHaveTextContent(INTRO);
    expect(screen.getByText(/never pay a fee to be represented/)).toBeVisible();
    await expectNoAxeViolations();

    await user.click(screen.getByRole('button', { name: 'Accept and reply' }));
    await user.type(await screen.findByLabelText('Your message'), 'Thank you! Happy to talk.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(screen.getByRole('log')).toHaveTextContent('Thank you! Happy to talk.');
    });
    expect(screen.getByLabelText('Your message')).toHaveValue('');
    const send = calls.find((call) => call.method === 'POST' && call.path.endsWith('/messages'))
      ?.body as { clientMessageId: string };
    expect(send.clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls.some((call) => call.path.endsWith('/read'))).toBe(true);
  });

  it('asks before declining, and can be talked out of it', async () => {
    let current = summary({ unread: 0 });
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(talent),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations/unread': () => Response.json({ unread: 1 }),
      [`GET /v1/me/conversations/${ID}`]: () => Response.json(current),
      [`GET /v1/me/conversations/${ID}/messages`]: () =>
        Response.json({ items: [intro(false)], nextCursor: null }),
      [`POST /v1/me/conversations/${ID}/response`]: () => {
        current = { ...current, status: 'declined', awaitingMyAnswer: false };
        return Response.json(current);
      },
    });
    renderAt(`/messages/${ID}`);
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    const confirm = screen.getByRole('group', { name: /Decline this request\?/ });
    await user.click(within(confirm).getByRole('button', { name: 'Keep it' }));
    expect(calls.some((call) => call.path.endsWith('/response'))).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Decline' }));
    await user.click(screen.getByRole('button', { name: 'Yes, decline' }));
    await waitFor(() => {
      expect(calls.find((call) => call.path.endsWith('/response'))?.body).toEqual({
        decision: 'decline',
      });
    });
  });

  it('lets a verified agent send a request from the profile, checking its length first', async () => {
    let existing: ConversationSummary | null = null;
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations/unread': () => Response.json({ unread: 0 }),
      'GET /v1/talents/ada.sings': () => Response.json(profile),
      'GET /v1/talents/ada.sings/portfolio': () => Response.json({ items: [] }),
      'GET /v1/me/shortlist/ada.sings': () => problem(404, 'NOT_FOUND'),
      'GET /v1/me/agent-verification': () => Response.json(verification('verified')),
      'GET /v1/me/conversations/with/ada.sings': () =>
        existing ? Response.json(existing) : problem(404, 'NOT_FOUND'),
      'POST /v1/talents/ada.sings/contact': () => {
        existing = summary({
          counterpart: talentSide,
          lastMessage: intro(true),
          unread: 0,
          awaitingMyAnswer: false,
        });
        return Response.json(existing, { status: 201 });
      },
    });
    renderAt('/talents/ada.sings');
    const user = userEvent.setup({ delay: null });
    const field = await screen.findByLabelText('Your introduction');
    await user.type(field, 'Hello there');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(field).toHaveAccessibleDescription(
      /Write at least 20 characters so they know who you are\./,
    );
    expect(calls.some((call) => call.path.endsWith('/contact'))).toBe(false);
    await expectNoAxeViolations();

    await user.clear(field);
    await user.type(field, INTRO);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Your request is waiting for Ada Nwosu to answer',
      }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open conversation' })).toHaveAttribute(
      'href',
      `/messages/${ID}`,
    );
    const body = calls.find((call) => call.path.endsWith('/contact'))?.body as {
      message: string;
      clientMessageId: string;
    };
    expect(body.message).toBe(INTRO);
    expect(body.clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('points an agent who is not verified yet to verification instead', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations/unread': () => Response.json({ unread: 0 }),
      'GET /v1/talents/ada.sings': () => Response.json(profile),
      'GET /v1/talents/ada.sings/portfolio': () => Response.json({ items: [] }),
      'GET /v1/me/shortlist/ada.sings': () => problem(404, 'NOT_FOUND'),
      'GET /v1/me/agent-verification': () => Response.json(verification('not_requested')),
      'GET /v1/me/conversations/with/ada.sings': () => problem(404, 'NOT_FOUND'),
    });
    renderAt('/talents/ada.sings');
    expect(
      await screen.findByRole('heading', { name: 'Only verified agencies can contact talent' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Get verified' })).toHaveAttribute(
      'href',
      '/verification',
    );
    expect(screen.queryByLabelText('Your introduction')).toBeNull();
  });

  it('lets an agent withdraw a request that is waiting', async () => {
    let current = summary({
      counterpart: talentSide,
      lastMessage: intro(true),
      unread: 0,
      awaitingMyAnswer: false,
    });
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations/unread': () => Response.json({ unread: 0 }),
      [`GET /v1/me/conversations/${ID}`]: () => Response.json(current),
      [`GET /v1/me/conversations/${ID}/messages`]: () =>
        Response.json({ items: [intro(true)], nextCursor: null }),
      [`POST /v1/me/conversations/${ID}/withdraw`]: () => {
        current = { ...current, status: 'withdrawn' };
        return Response.json(current);
      },
    });
    renderAt(`/messages/${ID}`);
    const user = userEvent.setup({ delay: null });
    expect(await screen.findByText('Waiting for Ada Nwosu to answer')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View profile' })).toHaveAttribute(
      'href',
      '/talents/ada.sings',
    );
    await user.click(screen.getByRole('button', { name: 'Withdraw request' }));
    expect(await screen.findByText('You withdrew this request')).toBeVisible();
  });

  it('invites an agent with no conversations to find talent', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations': () => Response.json({ items: [], nextCursor: null }),
    });
    renderAt('/messages');
    expect(await screen.findByText('No conversations yet')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Find talent' })).toHaveAttribute('href', '/search');
  });

  it("lets a talent report the agent from the conversation, sending only the conversation's id", async () => {
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(talent),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations/unread': () => Response.json({ unread: 0 }),
      [`GET /v1/me/conversations/${ID}`]: () => Response.json(summary({ unread: 0 })),
      [`GET /v1/me/conversations/${ID}/messages`]: () =>
        Response.json({ items: [intro(false)], nextCursor: null }),
      'POST /v1/reports': () => new Response(null, { status: 204 }),
    });
    renderAt(`/messages/${ID}`);
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Report this conversation' }));
    expect(
      screen.getByText(/will see the messages the other person sent here, not yours/),
    ).toBeVisible();
    await user.click(screen.getByLabelText('Asking for money, scamming or harassing'));
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText(/A moderator will look at this conversation/)).toBeVisible();
    expect(calls.find((call) => call.path === '/v1/reports')?.body).toEqual({
      subject: { kind: 'conversation', conversationId: ID },
      category: 'scam_or_harassment',
    });
  });

  it('blocks after asking, then offers unblock', async () => {
    let current = summary({ unread: 0 });
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(talent),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations/unread': () => Response.json({ unread: 0 }),
      [`GET /v1/me/conversations/${ID}`]: () => Response.json(current),
      [`GET /v1/me/conversations/${ID}/messages`]: () =>
        Response.json({ items: [intro(false)], nextCursor: null }),
      [`POST /v1/me/conversations/${ID}/block`]: () => {
        current = { ...current, status: 'declined', awaitingMyAnswer: false, blockedByMe: true };
        return Response.json(current);
      },
      [`DELETE /v1/me/conversations/${ID}/block`]: () => {
        current = { ...current, blockedByMe: false };
        return Response.json(current);
      },
      'GET /v1/me/conversations': () => Response.json({ items: [], nextCursor: null }),
    });
    const router = renderAt(`/messages/${ID}`);
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Block Eko Talent Partners' }));
    const confirm = screen.getByRole('group', { name: 'Block Eko Talent Partners?' });
    expect(confirm).toHaveTextContent('This also declines their request');
    await expectNoAxeViolations();
    await user.click(within(confirm).getByRole('button', { name: 'Yes, block' }));
    expect(await screen.findByText('You blocked Eko Talent Partners')).toBeVisible();
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/block'))).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Unblock Eko Talent Partners' }));
    await waitFor(() => {
      expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
    });
    // The request stays declined, so the talent goes back to their messages.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/messages');
    });
  });
});
