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
  TAXONOMY,
} from '../../test/app-harness';

const talentProfile = {
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
  avatarMediaId: null,
  avatarUrls: null,
  isComplete: true,
  missing: [],
  version: 3,
  updatedAt: '2026-10-02T09:00:00.000Z',
};

describe('home dashboards', () => {
  beforeEach(resetSession);

  it('shows a talent their profile, what is waiting and their work', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ role: 'talent', status: 'active' })),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations/unread': () => Response.json({ unread: 2 }),
      'GET /v1/me/conversations': () => Response.json({ items: [], nextCursor: null }),
      'GET /v1/me/talent-profile': () => Response.json(talentProfile),
      'GET /v1/me/portfolio': () => Response.json({ items: [], maxItems: 30, version: 0 }),
    });
    renderAt('/home');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome back, Ngozi Adeyemi' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /2 waiting for you/ })).toHaveAttribute(
      'href',
      '/messages',
    );
    expect(screen.getByRole('link', { name: 'View public profile' })).toHaveAttribute(
      'href',
      '/talents/ngozi.sings',
    );
    expect(await screen.findByText('0 of 30 photos and clips')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Add work' })).toHaveAttribute('href', '/portfolio');
    await expectNoAxeViolations();
  });

  it('lets an agent search straight from home, or browse a discipline', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ role: 'agent', status: 'active' })),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations': () => Response.json({ items: [], nextCursor: null }),
      'GET /v1/me/shortlist': () =>
        Response.json({ items: [], saved: 0, max: 500, nextCursor: null }),
      'GET /v1/taxonomy': () => Response.json(TAXONOMY),
      'GET /v1/me/agent-profile': () =>
        Response.json({
          userId: '0192a3b4-0000-7000-8000-000000000001',
          agencyName: 'Eko Talent Partners',
          jobTitle: 'Scout',
          specializations: [],
          city: null,
          website: null,
          verified: true,
          isComplete: true,
          missing: [],
          version: 2,
          updatedAt: '2026-10-02T09:00:00.000Z',
        }),
      'GET /v1/search/talents': () =>
        Response.json({
          items: [],
          total: 0,
          page: 1,
          perPage: 24,
          hasMore: false,
          facets: { categories: [], cities: [] },
        }),
    });
    const router = renderAt('/home');
    const user = userEvent.setup({ delay: null });
    expect(await screen.findByText('Verified agency')).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Music' })).toHaveAttribute(
      'href',
      '/search?category=music',
    );
    expect(
      await screen.findByText('Save talent from their profile to compare them here.'),
    ).toBeVisible();
    await expectNoAxeViolations();

    const search = screen.getByRole('search');
    await user.type(within(search).getByLabelText('Search talent'), 'afro soul');
    await user.click(within(search).getByRole('button', { name: 'Find talent' }));
    await waitFor(() => {
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/search?q=afro%20soul',
      );
    });
  });
});
