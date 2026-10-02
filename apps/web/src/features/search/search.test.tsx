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
  type Call,
} from '../../test/app-harness';

const agent = meFor({ role: 'agent', status: 'active' });

const card = (n: number) => ({
  handle: `talent.${String(n)}`,
  displayName: `Talent ${String(n)}`,
  category: { slug: 'music', name: 'Music' },
  subcategories: [{ slug: 'singer', name: 'Singer' }],
  city: { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
  ageYears: 20 + (n % 10),
  verified: n === 1,
  avatarUrls: null,
});

/** Answers like the API: 24 per page, with facets and hasMore. */
function searchApi(total: number) {
  return (call: Call) => {
    const params = new URL(`https://api.test${call.path}${call.query}`).searchParams;
    const page = Number(params.get('page') ?? '1');
    const start = (page - 1) * 24;
    const items = Array.from({ length: Math.max(0, Math.min(24, total - start)) }, (_, i) =>
      card(start + i + 1),
    );
    return Response.json({
      items,
      total,
      page,
      perPage: 24,
      hasMore: page * 24 < total,
      facets: {
        categories: [{ slug: 'music', name: 'Music', count: total }],
        cities: [{ slug: 'ng-lagos', name: 'Lagos', count: total }],
      },
    });
  };
}

describe('search for agents', () => {
  beforeEach(resetSession);

  it('lists the newest talent first, with the count announced, and passes axe', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
      'GET /v1/search/talents': searchApi(30),
    });
    renderAt('/search');
    expect(await screen.findByText('30 talent found')).toBeVisible();
    expect(screen.getAllByRole('link', { name: /Talent \d+/ })).toHaveLength(24);
    await expectNoAxeViolations();
  });

  it('puts the filters in the address and sends them, with counts next to each option', async () => {
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
      'GET /v1/search/talents': searchApi(3),
    });
    const router = renderAt('/search');
    const user = userEvent.setup({ delay: null });
    await screen.findByText('3 talent found');
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'afro soul');
    await user.click(screen.getByText('Filters'));
    await user.selectOptions(screen.getByLabelText('City'), 'ng-lagos');
    expect(screen.getByRole('option', { name: 'Lagos (3)' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Youngest age'), '18');
    await user.type(screen.getByLabelText('Oldest age'), '25');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(router.state.location.search).toBe('?q=afro+soul&cities=ng-lagos&ageMin=18&ageMax=25');
    await waitFor(() => {
      expect(calls.filter((call) => call.path === '/v1/search/talents').at(-1)?.query).toBe(
        '?q=afro+soul&cities=ng-lagos&ageMin=18&ageMax=25&page=1',
      );
    });
  });

  it('loads the next page on request, and stops offering more at the end', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
      'GET /v1/search/talents': searchApi(30),
    });
    renderAt('/search');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Show more' }));
    expect(await screen.findByRole('link', { name: /Talent 30/ })).toHaveAttribute(
      'href',
      '/talents/talent.30',
    );
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('checks the age range before searching', async () => {
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
      'GET /v1/search/talents': searchApi(0),
    });
    renderAt('/search');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByText('Filters'));
    await user.type(screen.getByLabelText('Youngest age'), '30');
    await user.type(screen.getByLabelText('Oldest age'), '20');
    const before = calls.length;
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByLabelText('Youngest age')).toHaveAccessibleDescription(
      'Ages must be between 18 and 99, youngest first.',
    );
    expect(calls.length).toBe(before);
  });

  it('says so plainly when nothing matches', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
      'GET /v1/search/talents': searchApi(0),
    });
    renderAt('/search?q=zzzz');
    expect(await screen.findByText(/No talent matches yet/)).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('zzzz');
  });

  it('offers search to agents, not to talent', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
      'GET /v1/me/agent-profile': () =>
        Response.json({
          userId: agent.id,
          agencyName: 'Eko Talent Partners',
          jobTitle: 'Talent scout',
          specializations: [],
          city: null,
          website: null,
          verified: false,
          isComplete: true,
          missing: [],
          version: 1,
          updatedAt: '2026-10-02T09:00:00.000Z',
        }),
    });
    renderAt('/home');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/search');
    expect(await screen.findByRole('link', { name: 'Find talent' })).toBeVisible();
  });
});
