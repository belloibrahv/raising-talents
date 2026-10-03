import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, session } from '../shared/api/client';
import { createQueryClient } from './query-client';
import { buildRoutes } from './routes';

const meFor = (overrides: Record<string, unknown> = {}) => ({
  id: '0192a3b4-0000-7000-8000-000000000001',
  email: 'ngozi.adeyemi@example.com',
  emailVerified: true,
  role: 'talent',
  roleLocked: false,
  status: 'onboarding',
  countryCode: 'NG',
  createdAt: '2026-10-01T09:00:00.000Z',
  ...overrides,
});

const signedIn = (me = meFor()) =>
  Response.json({ accessToken: 'access-1', accessTokenExpiresAt: '2099-01-01T00:00:00.000Z', me });

const problem = (status: number, code: string, detail?: string) =>
  Response.json({ type: 'about:blank', title: 'Error', status, code, detail }, { status });

type Route = (init: RequestInit | undefined) => Response;

/** Answers API calls by path; anything unexpected fails the test loudly. */
function stubApi(routes: Record<string, Route>) {
  const calls: { path: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    await Promise.resolve();
    const path = new URL(url).pathname;
    calls.push({ path, body: init?.body ? JSON.parse(init.body as string) : undefined });
    const route = routes[path];
    if (!route) throw new Error(`Unexpected call to ${path}`);
    return route(init);
  });
  return calls;
}

function renderAt(path: string) {
  const router = createMemoryRouter(buildRoutes(), { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** axe without colour contrast, which jsdom cannot compute; contrast is checked against the tokens instead. */
async function expectNoAxeViolations() {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

describe('the web app', () => {
  beforeEach(() => {
    // The client and the store live for the whole app; start each test as the app starts.
    http.forgetSession();
    session.signedOut();
    session.restoring();
  });

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

  it('signs in and opens the app for a verified talent', async () => {
    const calls = stubApi({
      '/v1/auth/web/refresh': () => problem(401, 'UNAUTHENTICATED'),
      '/v1/auth/web/sign-in': () => signedIn(),
    });
    const router = renderAt('/sign-in');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), ' Ngozi.Adeyemi@example.com ');
    await user.type(screen.getByLabelText('Password'), 'runway-lagos-fashion-week');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your portfolio starts here' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/home');
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
    });
    const router = renderAt('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /I am an agent or scout/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your search starts here' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/home');
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
