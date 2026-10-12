import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { meFor, renderAt, resetSession, signedIn, stubApi } from '../test/app-harness';

const agent = meFor({ role: 'agent', status: 'active' });
const asAgent = () =>
  stubApi({
    '/v1/auth/web/refresh': () => signedIn(agent),
    'GET /v1/me/sessions': () => Response.json({ items: [] }),
  });

/** jsdom lays nothing out, so these check what the phone layout is given, not how it looks. */
describe('the app shell on a phone', () => {
  beforeEach(resetSession);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gives a screen that is not a tab its own way back, and a tab none', async () => {
    asAgent();
    const router = renderAt('/notifications');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    // Opened directly, there is nothing behind it: back goes up to the home screen.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/home');
    });
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('offers signing out on the account screen as well as in the header', async () => {
    const calls = asAgent();
    renderAt('/account');
    const user = userEvent.setup({ delay: null });
    await screen.findByRole('region', { name: 'Where you are signed in' });
    const buttons = screen.getAllByRole('button', { name: 'Sign out' });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1] as HTMLElement);
    await waitFor(() => {
      expect(calls.some((call) => call.path === '/v1/auth/web/sign-out')).toBe(true);
    });
  });

  it('moves the tab bar away while someone types on a touch screen', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    asAgent();
    renderAt('/account');
    const tabs = await screen.findByRole('navigation', { name: 'Main' });
    expect(tabs).not.toHaveClass('max-md:hidden');
    const field = document.createElement('textarea');
    document.body.append(field);
    act(() => {
      field.focus();
    });
    expect(tabs).toHaveClass('max-md:hidden');
    act(() => {
      field.blur();
    });
    await waitFor(() => {
      expect(tabs).not.toHaveClass('max-md:hidden');
    });
    field.remove();
  });
});
