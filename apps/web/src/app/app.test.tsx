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
  TAXONOMY,
} from '../test/app-harness';

describe('the web app', () => {
  beforeEach(resetSession);

  it('sends a signed-out visitor to the welcome screen, which passes axe', async () => {
    stubApi({ '/v1/auth/web/refresh': () => problem(401, 'UNAUTHENTICATED') });
    const router = renderAt('/');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /get seen by the people who scout talent/i,
      }),
    ).toHaveFocus();
    expect(router.state.location.pathname).toBe('/welcome');
    expect(document.title).toBe('Raising Talents');
    await expectNoAxeViolations();
  });

  it('signs in a talent who has not finished setting up, and resumes the profile wizard', async () => {
    const calls = stubApi({
      '/v1/auth/web/refresh': () => problem(401, 'UNAUTHENTICATED'),
      '/v1/auth/web/sign-in': () => signedIn(),
      '/v1/me/talent-profile': () => problem(404, 'NOT_FOUND'),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
    });
    const router = renderAt('/sign-in');
    const user = userEvent.setup({ delay: null });
    await user.type(await screen.findByLabelText('Email'), ' Ngozi.Adeyemi@example.com ');
    await user.type(screen.getByLabelText('Password'), 'runway-lagos-fashion-week');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/onboarding/talent/about');
    const body = calls.find((call) => call.path === '/v1/auth/web/sign-in')?.body as Record<
      string,
      string
    >;
    expect(body['email']).toBe('ngozi.adeyemi@example.com');
    expect(body['deviceId']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('shows the API error for wrong credentials as an alert', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => problem(401, 'UNAUTHENTICATED'),
      '/v1/auth/web/sign-in': () => problem(401, 'INVALID_CREDENTIALS'),
    });
    renderAt('/sign-in');
    const user = userEvent.setup({ delay: null });
    await user.type(await screen.findByLabelText('Email'), 'ngozi.adeyemi@example.com');
    await user.type(screen.getByLabelText('Password'), 'not-the-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email and password do not match.',
    );
  });

  it('checks the sign-up form before sending it and moves focus to the first problem', async () => {
    const calls = stubApi({ '/v1/auth/web/refresh': () => problem(401, 'UNAUTHENTICATED') });
    renderAt('/sign-up');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Create account' }));

    const email = screen.getByLabelText('Email');
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Enter a valid email address.');
    expect(screen.getByLabelText('Date of birth')).toHaveAccessibleDescription(
      /Only used to confirm your age.*Enter your date of birth as DD\/MM\/YYYY\./,
    );
    expect(calls.map((call) => call.path)).not.toContain('/v1/auth/web/sign-up');
    await expectNoAxeViolations();
  });

  it('formats the date of birth as it is typed and shows the age rule against the field', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => problem(401, 'UNAUTHENTICATED'),
      '/v1/auth/web/sign-up': () =>
        problem(422, 'UNDER_MINIMUM_AGE', 'You need to be 18 or older.'),
    });
    renderAt('/sign-up');
    const user = userEvent.setup({ delay: null });
    await user.type(await screen.findByLabelText('Email'), 'tobi.ade@example.com');
    await user.type(screen.getByLabelText('Password'), 'drummer-from-oshogbo');
    const dateOfBirth = screen.getByLabelText('Date of birth');
    await user.type(dateOfBirth, '01022010');
    expect(dateOfBirth).toHaveValue('01/02/2010');
    await user.click(screen.getByLabelText(/I agree to the Terms/));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(dateOfBirth).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps an unverified account on the code screen, whatever address it opens', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ emailVerified: false, role: null })),
    });
    const router = renderAt('/home');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Check your email' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/verify-email');
    expect(screen.getByLabelText('Verification code')).toHaveAttribute(
      'autocomplete',
      'one-time-code',
    );
    await expectNoAxeViolations();
  });

  it('asks for a role next, using a labelled radio group', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ role: null })),
      '/v1/me/role': () => Response.json(meFor({ role: 'agent' })),
      '/v1/me/agent-profile': () => problem(404, 'NOT_FOUND'),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
    });
    const router = renderAt('/');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('radio', { name: /I am an agent or scout/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your agency' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/onboarding/agent');
  });

  it('offers a retry instead of signing out when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'You are offline' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('answers unknown addresses with a page that leads back', async () => {
    stubApi({ '/v1/auth/web/refresh': () => problem(401, 'UNAUTHENTICATED') });
    renderAt('/talents/someone/old-link');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to the start' })).toHaveAttribute('href', '/');
  });
});
