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
  TAXONOMY,
} from '../../test/app-harness';

const EKO = '0192a3b4-0000-7000-8000-0000000000e1';

const card = (overrides: Record<string, unknown> = {}) => ({
  id: EKO,
  agencyName: 'Eko Talent Partners',
  jobTitle: 'Senior scout',
  city: { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
  specializations: [{ slug: 'music', name: 'Music' }],
  verified: true,
  rosterStatus: 'open',
  avatarUrls: null,
  saved: false,
  ...overrides,
});

const asTalent = (extra: Parameters<typeof stubApi>[0] = {}) =>
  stubApi({
    '/v1/auth/web/refresh': () => signedIn(meFor({ role: 'talent', status: 'active' })),
    'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
    'GET /v1/me/conversations/unread': () => Response.json({ unread: 0 }),
    'GET /v1/me/talent-profile': () => problem(404, 'NOT_FOUND'),
    'GET /v1/taxonomy': () => Response.json(TAXONOMY),
    'GET /v1/agents': () => Response.json({ items: [card()], nextCursor: null }),
    'GET /v1/me/saved-agents': () =>
      Response.json({ items: [card({ saved: true })], nextCursor: null }),
    [`PUT /v1/agents/${EKO}/saved`]: () => Response.json({ saved: true }),
    [`DELETE /v1/agents/${EKO}/saved`]: () => Response.json({ saved: false }),
    [`GET /v1/me/conversations/with-agent/${EKO}`]: () => problem(404, 'NOT_FOUND'),
    ...extra,
  });

describe('agents, as talent find them', () => {
  beforeEach(resetSession);

  it('lists verified agents with who they look for and whether they are open', async () => {
    const calls = asTalent();
    renderAt('/agents');
    const agent = await screen.findByRole('article', { name: 'Eko Talent Partners' });
    expect(within(agent).getByText('Open for submissions')).toBeVisible();
    expect(within(agent).getByText('Music')).toBeVisible();
    expect(within(agent).getByText('Lagos, Nigeria')).toBeVisible();
    expect(within(agent).getByRole('link', { name: /Eko Talent Partners/ })).toHaveAttribute(
      'href',
      `/agents/${EKO}`,
    );
    expect(screen.getByRole('link', { name: 'Talent' })).toHaveAttribute('href', '/search');
    await expectNoAxeViolations();

    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByLabelText('Only show agents who are open for submissions'));
    await user.click(screen.getByRole('button', { name: 'Music' }));
    await waitFor(() => {
      expect(calls.filter((call) => call.path === '/v1/agents').at(-1)?.query).toBe(
        '?category=music&open=true',
      );
    });
  });

  it('saves an agent at once, and keeps a list to come back to', async () => {
    const calls = asTalent();
    renderAt('/agents');
    const user = userEvent.setup({ delay: null });
    const agent = await screen.findByRole('article', { name: 'Eko Talent Partners' });
    const save = within(agent).getByRole('button', { name: 'Save Eko Talent Partners' });
    expect(save).toHaveAttribute('aria-pressed', 'false');
    await user.click(save);
    expect(
      await within(agent).findByRole('button', {
        name: 'Eko Talent Partners is saved. Press to remove',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(calls.some((call) => call.method === 'PUT' && call.path.endsWith('/saved'))).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Saved' }));
    await waitFor(() => {
      expect(calls.some((call) => call.path === '/v1/me/saved-agents')).toBe(true);
    });
    expect(screen.queryByRole('search')).toBeNull();
  });

  it("shows an agent's page: the badge, the status, the bio and the way to save them", async () => {
    asTalent({
      [`GET /v1/agents/${EKO}`]: () =>
        Response.json({
          ...card(),
          bio: 'FIFA licensed. Placed players with clubs in Belgium.',
          website: 'https://eko-talent.example',
          avatarMediaId: null,
          memberSince: '2026-08-01T09:00:00.000Z',
          isSelf: false,
        }),
    });
    renderAt(`/agents/${EKO}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Eko Talent Partners' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Verified agency')).toBeVisible();
    expect(screen.getByText('Open for submissions')).toBeVisible();
    expect(screen.getByText('FIFA licensed. Placed players with clubs in Belgium.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'eko-talent.example' })).toHaveAttribute(
      'href',
      'https://eko-talent.example',
    );
    expect(screen.getByRole('button', { name: 'Save Eko Talent Partners' })).toBeVisible();
    await expectNoAxeViolations();
  });

  it('says so when an agent is no longer listed', async () => {
    asTalent({ [`GET /v1/agents/${EKO}`]: () => problem(404, 'NOT_FOUND') });
    renderAt(`/agents/${EKO}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'This agent is not available' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse agents' })).toHaveAttribute('href', '/agents');
  });

  it('sends a submission to an agent who is open, and shows it waiting', async () => {
    const page = {
      ...card(),
      bio: '',
      website: null,
      avatarMediaId: null,
      memberSince: '2026-08-01T09:00:00.000Z',
      isSelf: false,
    };
    // The server remembers the submission, as the real one does.
    let submission: Record<string, unknown> | null = null;
    const calls = asTalent({
      [`GET /v1/agents/${EKO}`]: () => Response.json(page),
      [`GET /v1/me/conversations/with-agent/${EKO}`]: () =>
        submission ? Response.json(submission) : problem(404, 'NOT_FOUND'),
      'GET /v1/me/conversations': () => Response.json({ items: [], nextCursor: null }),
      [`POST /v1/agents/${EKO}/submission`]: () => {
        submission = {
          id: '0192a3b4-0000-7000-8000-0000000000c1',
          kind: 'agent',
          status: 'requested',
          counterpart: {
            kind: 'agent',
            agencyName: 'Eko Talent Partners',
            jobTitle: 'Senior scout',
            city: 'Lagos, Nigeria',
            verified: true,
            specializations: ['Music'],
            website: null,
            verifiedAt: '2026-09-01T09:00:00.000Z',
            memberSince: '2026-08-01T09:00:00.000Z',
          },
          lastMessage: null,
          unread: 0,
          canSend: false,
          awaitingMyAnswer: false,
          requestedByMe: true,
          blockedByMe: false,
          requestedAt: '2026-10-11T09:00:00.000Z',
          updatedAt: '2026-10-11T09:00:00.000Z',
        };
        return Response.json(submission, { status: 201 });
      },
    });
    renderAt(`/agents/${EKO}`);
    const user = userEvent.setup({ delay: null });
    const form = await screen.findByRole('region', {
      name: 'Send Eko Talent Partners a submission',
    });
    await user.click(within(form).getByRole('button', { name: 'Send submission' }));
    expect(within(form).getByLabelText('Your introduction')).toHaveAccessibleDescription(
      /Write at least 20 characters/,
    );
    await user.type(
      within(form).getByLabelText('Your introduction'),
      'Singer from Lagos with two EPs out. I would love you to hear my latest set.',
    );
    await user.click(within(form).getByRole('button', { name: 'Send submission' }));
    expect(
      await screen.findByRole('region', {
        name: 'Your submission is waiting for Eko Talent Partners to answer',
      }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open conversation' })).toHaveAttribute(
      'href',
      '/messages/0192a3b4-0000-7000-8000-0000000000c1',
    );
    const sent = calls.find((call) => call.path.endsWith('/submission'));
    expect(sent?.body).toMatchObject({
      message: 'Singer from Lagos with two EPs out. I would love you to hear my latest set.',
    });
  });

  it('does not offer a submission when the roster is full', async () => {
    asTalent({
      [`GET /v1/agents/${EKO}`]: () =>
        Response.json({
          ...card({ rosterStatus: 'full' }),
          bio: '',
          website: null,
          avatarMediaId: null,
          memberSince: '2026-08-01T09:00:00.000Z',
          isSelf: false,
        }),
      [`GET /v1/me/conversations/with-agent/${EKO}`]: () => problem(404, 'NOT_FOUND'),
    });
    renderAt(`/agents/${EKO}`);
    expect(
      await screen.findByText(/This agent is not taking on new talent right now/),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Send submission' })).toBeNull();
  });
});
