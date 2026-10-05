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

const talent = meFor({ status: 'active' });
const notices = [
  {
    id: '0192a3b4-0000-7000-8000-0000000000a1',
    kind: 'media_rejected',
    mediaKind: 'video',
    purpose: 'portfolio',
    reason: 'This video breaks the Community Guidelines, so it cannot be shown.',
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    read: false,
  },
  {
    id: '0192a3b4-0000-7000-8000-0000000000a2',
    kind: 'password_changed',
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    read: true,
  },
];

describe('notification inbox', () => {
  beforeEach(resetSession);

  it('shows the unread count on the bell, words each notice and marks them read', async () => {
    let unread = 1;
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(talent),
      'GET /v1/me/portfolio': () => Response.json({ items: [], maxItems: 30, version: 0 }),
      'GET /v1/me/notifications/unread': () => Response.json({ unread }),
      'GET /v1/me/notifications': () => Response.json({ items: notices, unread, nextCursor: null }),
      'POST /v1/me/notifications/read': () => {
        unread = 0;
        return new Response(null, { status: 204 });
      },
    });
    renderAt('/portfolio');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('link', { name: 'Notifications, 1 unread' }));

    await screen.findByRole('heading', { level: 1, name: 'Notifications' });
    const fresh = await screen.findByRole('region', { name: 'New' });
    const earlier = screen.getByRole('region', { name: 'Earlier' });
    const [first] = within(fresh).getAllByRole('link');
    const [second] = within(earlier).getAllByRole('link');
    expect(first).toHaveTextContent('New: Your portfolio video was not approved');
    expect(first).toHaveTextContent('This video breaks the Community Guidelines');
    expect(first).toHaveTextContent('2 hours ago');
    expect(first).toHaveAttribute('href', '/portfolio');
    expect(second).toHaveTextContent('Your password was changed');
    expect(second).toHaveAttribute('href', '/account');
    await waitFor(() => {
      expect(calls.some((call) => call.path === '/v1/me/notifications/read')).toBe(true);
    });
    expect(await screen.findByRole('link', { name: 'Notifications' })).toBeVisible();
    await expectNoAxeViolations();
  });

  it('explains what will appear when there is nothing yet', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(talent),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/notifications': () => Response.json({ items: [], unread: 0, nextCursor: null }),
    });
    renderAt('/notifications');
    expect(await screen.findByText('Nothing new')).toBeVisible();
  });
});
