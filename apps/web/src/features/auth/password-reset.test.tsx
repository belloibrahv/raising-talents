import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  expectNoAxeViolations,
  problem,
  renderAt,
  resetSession,
  stubApi,
} from '../../test/app-harness';

const signedOut = () => problem(401, 'UNAUTHENTICATED');

describe('password reset', () => {
  beforeEach(resetSession);

  it('goes from sign in to a new password and back, with the code checked by the API', async () => {
    let attempts = 0;
    const calls = stubApi({
      '/v1/auth/web/refresh': signedOut,
      'POST /v1/auth/password-reset': () => new Response(null, { status: 202 }),
      'POST /v1/auth/password-reset/confirm': () => {
        attempts += 1;
        return attempts === 1
          ? problem(422, 'VERIFICATION_CODE_INVALID', 'That code is not right. 4 attempt(s) left.')
          : new Response(null, { status: 204 });
      },
    });
    const router = renderAt('/sign-in');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('link', { name: 'Forgot your password?' }));
    // The next screen loads on demand; wait for it, not for the sign-in form's own Email field.
    await screen.findByRole('heading', { level: 1, name: 'Reset your password' });
    await user.type(screen.getByLabelText('Email'), ' Ngozi.Adeyemi@example.com ');
    await user.click(screen.getByRole('button', { name: 'Send the code' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Choose a new password' }),
    ).toBeVisible();
    expect(router.state.location.search).toBe('?email=ngozi.adeyemi%40example.com');
    expect(screen.getByText(/If ngozi\.adeyemi@example\.com has an account/)).toBeVisible();
    await expectNoAxeViolations();

    const code = screen.getByLabelText('Code from the email');
    await user.type(code, '123456');
    await user.type(screen.getByLabelText('New password'), 'free-kick-top-corner-ibadan');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    await waitFor(() =>
      expect(code).toHaveAccessibleDescription('That code is not right. 4 attempt(s) left.'),
    );

    await user.clear(code);
    await user.type(code, '654321');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(
      await screen.findByText('Your password was changed. Sign in with the new one.'),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(calls.find((call) => call.path === '/v1/auth/password-reset')?.body).toEqual({
      email: 'ngozi.adeyemi@example.com',
    });
    expect(
      calls.filter((call) => call.path === '/v1/auth/password-reset/confirm').at(-1)?.body,
    ).toEqual({
      email: 'ngozi.adeyemi@example.com',
      code: '654321',
      newPassword: 'free-kick-top-corner-ibadan',
    });
  });

  it('sends anyone who opens the reset screen without an email back to the start', async () => {
    stubApi({ '/v1/auth/web/refresh': signedOut });
    const router = renderAt('/reset-password');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reset your password' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/forgot-password');
  });
});
