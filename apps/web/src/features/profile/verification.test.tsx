import type { MyAgentVerification } from '@rt/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  expectNoAxeViolations,
  meFor,
  renderAt,
  resetSession,
  signedIn,
  stubApi,
} from '../../test/app-harness';

const agent = meFor({ role: 'agent', status: 'active' });
const moderator = meFor({ role: 'moderator', status: 'active' });
const agentProfile = {
  userId: agent.id,
  agencyName: 'Eko Talent Partners',
  jobTitle: 'Talent scout',
  specializations: [],
  city: null,
  website: null,
  verified: false,
  isComplete: true,
  missing: [],
  version: 2,
  updatedAt: '2026-10-02T09:00:00.000Z',
};
const requestId = '0192a3b4-0000-7000-8000-0000000000e1';

describe('agent verification', () => {
  beforeEach(resetSession);

  it('asks an unverified agent to verify their email before asking for the badge', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn({ ...agent, emailVerified: false }),
      'GET /v1/me/agent-profile': () => Response.json(agentProfile),
      'GET /v1/me/agent-verification': () =>
        Response.json({
          state: 'not_requested',
          declineReason: null,
          submittedAt: null,
          canRequest: false,
        }),
    });
    renderAt('/home');
    const card = await screen.findByRole('region', { name: 'Get verified' });
    expect(card).toHaveTextContent('Verify your email first.');
    expect(within(card).getByRole('link', { name: 'Verify email' })).toHaveAttribute(
      'href',
      '/verify-email',
    );
  });

  it('shows a declined reason on the home screen and sends new evidence', async () => {
    let state: MyAgentVerification = {
      state: 'declined',
      declineReason: 'We could not open the page you sent. Check the address and try again.',
      submittedAt: '2026-10-01T09:00:00.000Z',
      canRequest: true,
    };
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/me/agent-profile': () => Response.json(agentProfile),
      'GET /v1/me/agent-verification': () => Response.json(state),
      'POST /v1/me/agent-verification': () => {
        state = {
          state: 'pending',
          declineReason: null,
          submittedAt: '2026-10-02T09:00:00.000Z',
          canRequest: false,
        };
        return Response.json(state, { status: 201 });
      },
    });
    renderAt('/home');
    const user = userEvent.setup({ delay: null });
    expect(
      await screen.findByText(/Not verified yet: We could not open the page you sent/),
    ).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Send new evidence' }));
    await screen.findByRole('heading', { level: 1, name: 'Get verified' });

    const evidence = screen.getByLabelText('A page that shows you work there');
    await user.type(evidence, 'eko-talent.example/team');
    await user.click(screen.getByRole('button', { name: 'Send for review' }));
    await waitFor(() => expect(evidence).toHaveAttribute('aria-invalid', 'true'));
    await expectNoAxeViolations();

    await user.clear(evidence);
    await user.type(evidence, 'https://eko-talent.example/team');
    await user.type(screen.getByLabelText('CAC registration number (optional)'), 'RC 1234567');
    await user.click(screen.getByRole('button', { name: 'Send for review' }));
    expect(await screen.findByText(/Sent. A moderator will check it/)).toBeVisible();
    expect(
      calls.find((call) => call.method === 'POST' && call.path === '/v1/me/agent-verification')
        ?.body,
    ).toEqual({
      evidenceUrl: 'https://eko-talent.example/team',
      registrationNumber: 'RC 1234567',
    });
  });

  it('gives moderators an agent queue next to the media queue, and verifies with one action', async () => {
    let pending = [
      {
        id: requestId,
        agentId: agent.id,
        email: 'tunde.bakare@eko-talent.example',
        agencyName: 'Eko Talent Partners',
        jobTitle: 'Talent scout',
        city: { slug: 'ng-lagos', name: 'Lagos' },
        specializations: [{ slug: 'music', name: 'Music' }],
        website: null,
        evidenceUrl: 'https://eko-talent.example/team',
        registrationNumber: 'RC 1234567',
        note: '',
        submittedAt: '2026-10-02T09:00:00.000Z',
        previouslyDeclined: 1,
      },
    ];
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(moderator),
      'GET /v1/moderation/media': () => Response.json({ items: [], nextCursor: null }),
      'GET /v1/moderation/agent-verifications': () =>
        Response.json({ items: pending, nextCursor: null }),
      [`POST /v1/moderation/agent-verifications/${requestId}/decision`]: () => {
        pending = [];
        return new Response(null, { status: 204 });
      },
    });
    renderAt('/moderation');
    const user = userEvent.setup({ delay: null });
    const tabs = await screen.findByRole('navigation', { name: 'Queues' });
    await user.click(within(tabs).getByRole('link', { name: 'Agents' }));
    const card = await screen.findByRole('article');
    expect(
      within(card).getByRole('link', { name: 'https://eko-talent.example/team' }),
    ).toHaveAttribute('rel', 'noreferrer noopener');
    expect(within(card).getByText('Declined 1 times before')).toBeVisible();
    await expectNoAxeViolations();
    await user.click(within(card).getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('No agents are waiting.')).toBeVisible();
    expect(calls.find((call) => call.path.endsWith('/decision'))?.body).toEqual({
      decision: 'approve',
    });
  });
});
