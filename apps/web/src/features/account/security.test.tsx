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
const device = (id: string, name: string | null, current: boolean) => ({
  id,
  device: name,
  signedInAt: '2026-10-01T09:00:00.000Z',
  lastActiveAt: '2026-10-03T09:00:00.000Z',
  current,
});
const PHONE = '0192a3b4-0000-7000-8000-0000000000f1';
const LAPTOP = '0192a3b4-0000-7000-8000-0000000000f2';
const TABLET = '0192a3b4-0000-7000-8000-0000000000f3';

describe('account security', () => {
  beforeEach(resetSession);

  it('lists devices, signs one out, then every other one', async () => {
    let devices = [
      device(PHONE, 'Chrome on Android', true),
      device(LAPTOP, 'Edge on Windows', false),
      device(TABLET, null, false),
    ];
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/me/sessions': () => Response.json({ items: devices }),
      [`DELETE /v1/me/sessions/${LAPTOP}`]: () => {
        devices = devices.filter((entry) => entry.id !== LAPTOP);
        return new Response(null, { status: 204 });
      },
      'POST /v1/me/sessions/sign-out-others': () => {
        devices = devices.filter((entry) => entry.current);
        return new Response(null, { status: 204 });
      },
    });
    renderAt('/account');
    const user = userEvent.setup({ delay: null });
    const card = await screen.findByRole('region', { name: 'Where you are signed in' });
    expect(await within(card).findByText('Edge on Windows')).toBeVisible();
    expect(within(card).getByText('This device')).toBeVisible();
    expect(within(card).getByText('Unknown device')).toBeVisible();
    expect(within(card).queryByRole('button', { name: 'Sign out Chrome on Android' })).toBeNull();
    await expectNoAxeViolations();

    await user.click(within(card).getByRole('button', { name: 'Sign out Edge on Windows' }));
    await waitFor(() => {
      expect(within(card).queryByText('Edge on Windows')).toBeNull();
    });
    await user.click(within(card).getByRole('button', { name: 'Sign out everywhere else' }));
    await waitFor(() => {
      expect(within(card).queryByText('Unknown device')).toBeNull();
    });
    expect(within(card).queryByRole('button', { name: 'Sign out everywhere else' })).toBeNull();
  });

  it('checks the fields, shows a wrong current password on its field, then changes it', async () => {
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/me/sessions': () =>
        Response.json({ items: [device(PHONE, 'Chrome on Android', true)] }),
      'POST /v1/me/password': (call) =>
        (call.body as { currentPassword: string }).currentPassword === 'relay-baton-ikorodu-26'
          ? new Response(null, { status: 204 })
          : problem(401, 'INVALID_CREDENTIALS', 'Your current password is not right.'),
    });
    renderAt('/account');
    const user = userEvent.setup({ delay: null });
    const card = await screen.findByRole('region', { name: 'Password' });
    await user.click(within(card).getByRole('button', { name: 'Change password' }));
    expect(within(card).getByLabelText('Current password')).toHaveAccessibleDescription(
      'Enter your current password.',
    );
    expect(calls.some((call) => call.path === '/v1/me/password')).toBe(false);

    await user.type(within(card).getByLabelText('Current password'), 'not-it-at-all');
    await user.type(within(card).getByLabelText('New password'), 'talking-drum-oyo-sunset-27');
    await user.click(within(card).getByRole('button', { name: 'Change password' }));
    await waitFor(() => {
      expect(within(card).getByLabelText('Current password')).toHaveAccessibleDescription(
        'That is not your current password.',
      );
    });

    await user.clear(within(card).getByLabelText('Current password'));
    await user.type(within(card).getByLabelText('Current password'), 'relay-baton-ikorodu-26');
    await user.click(within(card).getByRole('button', { name: 'Change password' }));
    expect(
      await within(card).findByText('Password changed. Other devices are signed out.'),
    ).toBeVisible();
    expect(within(card).getByLabelText('New password')).toHaveValue('');
  });
});
