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
});
