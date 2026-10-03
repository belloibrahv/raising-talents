import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expectNoAxeViolations,
  meFor,
  problem,
  renderAt,
  resetSession,
  signedIn,
  stubApi,
} from '../../test/app-harness';

const agent = meFor({ role: 'agent', status: 'active' });
const scheduled = {
  ...agent,
  status: 'pending_deletion',
  deletionScheduledAt: '2026-11-01T09:00:00.000Z',
};

describe('account page', () => {
  beforeEach(resetSession);

  it('downloads the data export as a file', async () => {
    const clicks = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/me/export': () =>
        Response.json({
          exportedAt: '2026-10-03T09:00:00.000Z',
          account: {
            email: agent.email,
            emailVerifiedAt: '2026-09-01T09:00:00.000Z',
            dateOfBirth: '1994-05-12',
            countryCode: 'NG',
            role: 'agent',
            status: 'active',
            deletionScheduledAt: null,
            createdAt: '2026-09-01T09:00:00.000Z',
          },
          talentProfile: null,
          agentProfile: null,
          agentVerification: null,
          portfolio: null,
          shortlist: [],
          notifications: [],
          media: [],
        }),
    });
    renderAt('/account');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Download my data' }));
    expect(await screen.findByText('Your data is downloading.')).toBeInTheDocument();
    expect(clicks).toHaveBeenCalledTimes(1);
    expect((clicks.mock.contexts[0] as HTMLAnchorElement).download).toBe(
      'raising-talents-data.json',
    );
  });

  it('needs the password and a ticked box, then shows the deletion date with a way back', async () => {
    let me: Record<string, unknown> = agent;
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'POST /v1/me/deletion': (call) => {
        if ((call.body as { password: string }).password !== 'relay-baton-ikorodu-26') {
          return problem(401, 'INVALID_CREDENTIALS', 'That password is not right.');
        }
        me = scheduled;
        return Response.json(me);
      },
      'POST /v1/me/deletion/cancel': () => Response.json({ ...agent, deletionScheduledAt: null }),
    });
    renderAt('/account');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Delete my account' }));
    expect(screen.getByLabelText('Your password')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.some((call) => call.path === '/v1/me/deletion')).toBe(false);
    await expectNoAxeViolations();

    await user.type(screen.getByLabelText('Your password'), 'wrong-one');
    await user.click(screen.getByLabelText(/I understand/));
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Your password')).toHaveAccessibleDescription(
        'That password is not right.',
      ),
    );

    await user.clear(screen.getByLabelText('Your password'));
    await user.type(screen.getByLabelText('Your password'), 'relay-baton-ikorodu-26');
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(
      await screen.findByText(/Your account will be deleted on 1 November 2026/),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Delete my account' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Keep my account' }));
    await waitFor(() => {
      expect(screen.queryByText(/will be deleted on/)).toBeNull();
    });
    expect(await screen.findByRole('button', { name: 'Delete my account' })).toBeVisible();
  });

  it('shows the banner on any screen after signing back in during the grace period', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor(scheduled)),
      'GET /v1/me/agent-profile': () => problem(404, 'NOT_FOUND'),
      'GET /v1/me/agent-verification': () => problem(404, 'NOT_FOUND'),
    });
    renderAt('/home');
    expect(await screen.findByRole('region', { name: 'Delete your account' })).toHaveTextContent(
      'Keep my account',
    );
  });
});
