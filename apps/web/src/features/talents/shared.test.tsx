import { screen, waitFor } from '@testing-library/react';
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

const shared = {
  handle: 'ngozi.sings',
  displayName: 'Ngozi Adeyemi',
  bio: 'Afro-soul singer from Lekki.',
  discipline: 'Singer',
  category: 'Music',
  city: 'Lagos',
  skills: ['Stage presence'],
  verified: true,
  avatarUrls: null,
  portfolio: [
    {
      id: '0192a3b4-0000-7000-8000-0000000000f1',
      kind: 'image',
      caption: 'Live at Hard Rock Lekki',
      urls: {
        small: 'https://media.test/1-256.webp',
        medium: 'https://media.test/1-1024.webp',
        large: 'https://media.test/1-2048.webp',
      },
    },
  ],
};

const profile = {
  userId: '0192a3b4-0000-7000-8000-000000000001',
  handle: 'ngozi.sings',
  displayName: 'Ngozi Adeyemi',
  bio: 'Afro-soul singer from Lekki.',
  category: { slug: 'music', name: 'Music' },
  subcategories: [{ slug: 'singer', name: 'Singer' }],
  skills: [],
  city: { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
  gender: null,
  genderSearchable: false,
  publicLink: false,
  shareCode: null as string | null,
  avatarMediaId: null,
  avatarUrls: null,
  isComplete: true,
  missing: [],
  version: 3,
  updatedAt: '2026-10-02T09:00:00.000Z',
};

describe('the shared talent page (ADR-042)', () => {
  beforeEach(resetSession);

  it('shows a talent to a signed-out visitor, and invites both kinds of visitor in', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => problem(401, 'UNAUTHENTICATED'),
      'GET /v1/shared/Ab3dE6fG': () => Response.json(shared),
    });
    const router = renderAt('/t/ngozi.sings/Ab3dE6fG');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ngozi Adeyemi' })).toHaveFocus();
    expect(router.state.location.pathname).toBe('/t/ngozi.sings/Ab3dE6fG');
    expect(screen.getByText('Singer')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Photo 1 by Ngozi Adeyemi' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Join as an agent' })).toHaveAttribute(
      'href',
      '/sign-up',
    );
    expect(document.title).toBe('Ngozi Adeyemi | Raising Talents');
    await expectNoAxeViolations();
  });

  it('says so, without a sign-in wall, when the link is off or old', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => problem(401, 'UNAUTHENTICATED'),
      'GET /v1/shared/OldCode1': () => problem(404, 'NOT_FOUND'),
    });
    renderAt('/t/gone/OldCode1');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'This profile is not available' }),
    ).toBeVisible();
  });

  it('offers to try again when the server fails, rather than calling the profile gone', async () => {
    let fail = true;
    stubApi({
      '/v1/auth/web/refresh': () => problem(401, 'UNAUTHENTICATED'),
      'GET /v1/shared/Ab3dE6fG': () => (fail ? problem(500, 'INTERNAL') : Response.json(shared)),
    });
    renderAt('/t/ngozi.sings/Ab3dE6fG');
    const user = userEvent.setup({ delay: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'We could not load this profile' }),
    ).toBeVisible();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ngozi Adeyemi' })).toBeVisible();
  });

  it('lets a talent turn their link on from Home and copy it', async () => {
    let current = profile;
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ role: 'talent', status: 'active' })),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations': () => Response.json({ items: [], nextCursor: null }),
      'GET /v1/me/portfolio': () => Response.json({ items: [], maxItems: 30, version: 0 }),
      'GET /v1/me/talent-profile': () => Response.json(current),
      'PATCH /v1/me/talent-profile': () => {
        current = {
          ...current,
          publicLink: true,
          shareCode: 'Ab3dE6fG',
          version: current.version + 1,
        };
        return Response.json(current);
      },
    });
    renderAt('/home');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Turn on my public link' }));
    const link = await screen.findByLabelText('Link to your profile');
    expect(link).toHaveValue(`${window.location.origin}/t/ngozi.sings/Ab3dE6fG`);
    expect(calls.find((call) => call.method === 'PATCH')?.headers['if-match']).toBe('"3"');
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    // user-event stands in for the clipboard, so the copy can be read back.
    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe(
        `${window.location.origin}/t/ngozi.sings/Ab3dE6fG`,
      );
    });
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeVisible();
  });
});
