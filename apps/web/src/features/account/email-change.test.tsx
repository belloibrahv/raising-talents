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

const agent = meFor({ role: 'agent', status: 'active' });
const NEW = 'bisi.new@example.com';
const pending = { newEmail: NEW, requestedAt: '2026-10-03T09:00:00.000Z' };

describe('changing the email address', () => {
  beforeEach(resetSession);

  it('shows whether the address is verified, and links to verify it', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn({ ...agent, emailVerified: false }),
      'GET /v1/me/sessions': () => Response.json({ items: [] }),
      'GET /v1/me/email/change': () => problem(404, 'NOT_FOUND'),
    });
    renderAt('/account');
    const card = await screen.findByRole('region', { name: 'Email address' });
    expect(within(card).getByText('Not verified')).toBeVisible();
    expect(within(card).getByRole('link', { name: 'Verify now' })).toHaveAttribute(
      'href',
      '/verify-email',
    );
  });

  it('asks for the password, sends a code, and switches the address with it', async () => {
    let waiting: typeof pending | null = null;
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/me/sessions': () => Response.json({ items: [] }),
      'GET /v1/me/email/change': () =>
        waiting ? Response.json(waiting) : problem(404, 'NOT_FOUND'),
      'POST /v1/me/email': (call) => {
        if ((call.body as { password: string }).password !== 'relay-baton-ikorodu-26') {
          return problem(401, 'INVALID_CREDENTIALS', 'Your password is not right.');
        }
        waiting = pending;
        return Response.json(pending, { status: 202 });
      },
      'POST /v1/me/email/confirm': (call) =>
        (call.body as { code: string }).code === '482913'
          ? Response.json({ ...agent, email: NEW, emailVerified: true })
          : problem(400, 'VERIFICATION_CODE_INVALID', 'That code is not right.'),
    });
    renderAt('/account');
    const user = userEvent.setup({ delay: null });
    const card = await screen.findByRole('region', { name: 'Email address' });
    expect(within(card).getByText(agent.email)).toBeVisible();
    await user.click(within(card).getByRole('button', { name: 'Change' }));
    await user.click(within(card).getByRole('button', { name: 'Send code' }));
    expect(within(card).getByLabelText('New email address')).toHaveAccessibleDescription(
      'Enter a valid email address.',
    );
    await expectNoAxeViolations();

    await user.type(within(card).getByLabelText('New email address'), NEW);
    await user.type(within(card).getByLabelText('Your password'), 'not-it-at-all');
    await user.click(within(card).getByRole('button', { name: 'Send code' }));
    await waitFor(() => {
      expect(within(card).getByLabelText('Your password')).toHaveAccessibleDescription(
        'That password is not right.',
      );
    });
    await user.clear(within(card).getByLabelText('Your password'));
    await user.type(within(card).getByLabelText('Your password'), 'relay-baton-ikorodu-26');
    await user.click(within(card).getByRole('button', { name: 'Send code' }));
    expect(
      await within(card).findByText(`We sent a 6-digit code to ${NEW}. It expires in 10 minutes.`),
    ).toBeVisible();

    await user.type(within(card).getByLabelText('Code from the new address'), '482913');
    expect(
      await within(card).findByText('Your email address is changed. Use it next time you sign in.'),
    ).toBeVisible();
    expect(within(card).getByText(NEW)).toBeVisible();
    expect(calls.filter((call) => call.path === '/v1/me/email/confirm')).toHaveLength(1);
  });

  it('returns to the code after a reload, and can keep the current address', async () => {
    let waiting: typeof pending | null = pending;
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/me/sessions': () => Response.json({ items: [] }),
      'GET /v1/me/email/change': () =>
        waiting ? Response.json(waiting) : problem(404, 'NOT_FOUND'),
      'DELETE /v1/me/email/change': () => {
        waiting = null;
        return new Response(null, { status: 204 });
      },
    });
    renderAt('/account');
    const user = userEvent.setup({ delay: null });
    const card = await screen.findByRole('region', { name: 'Email address' });
    expect(await within(card).findByLabelText('Code from the new address')).toBeVisible();
    await user.click(within(card).getByRole('button', { name: 'Keep my current address' }));
    expect(await within(card).findByRole('button', { name: 'Change' })).toBeVisible();
    expect(within(card).getByText(agent.email)).toBeVisible();
  });
});
