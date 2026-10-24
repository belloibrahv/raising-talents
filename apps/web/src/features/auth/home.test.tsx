import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cardFor,
  expectNoAxeViolations,
  feedRoutes,
  meFor,
  postFor,
  renderAt,
  resetSession,
  signedIn,
  socialFor,
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
  publicLink: false,
  shareCode: null,
  photoInReview: false,
  avatarMediaId: null,
  avatarUrls: null,
  isComplete: true,
  missing: [],
  version: 3,
  updatedAt: '2026-10-02T09:00:00.000Z',
};

const talentHome = (extra: Parameters<typeof stubApi>[0] = {}) =>
  stubApi({
    '/v1/auth/web/refresh': () => signedIn(meFor({ role: 'talent', status: 'active' })),
    'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
    'GET /v1/me/conversations/unread': () => Response.json({ unread: 2 }),
    'GET /v1/me/conversations': () => Response.json({ items: [], nextCursor: null }),
    'GET /v1/me/talent-profile': () => Response.json(talentProfile),
    'GET /v1/taxonomy': () => Response.json(TAXONOMY),
    'GET /v1/talents/ngozi.sings/social': () =>
      Response.json(socialFor({ isSelf: true, posts: 3, followers: 12 })),
    ...feedRoutes(
      [postFor(1, { caption: 'Heats at Teslim Balogun', likes: 4 }), postFor(2)],
      [cardFor('zainab.bello', 'Zainab Bello')],
    ),
    ...extra,
  });

describe('home', () => {
  beforeEach(resetSession);

  it('opens on the feed, with what is waiting and a way to post', async () => {
    talentHome();
    renderAt('/home');
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
    const [post] = await screen.findAllByRole('article', { name: 'Post by Tobi Adebayo' });
    if (!post) throw new Error('no post');
    expect(within(post).getByText('Heats at Teslim Balogun')).toBeVisible();
    expect(within(post).getByText('4 likes')).toBeVisible();
    expect(within(post).getByText('Singer · Lagos, Nigeria')).toBeVisible();
    expect(await screen.findByRole('link', { name: /2 waiting for you/ })).toHaveAttribute(
      'href',
      '/messages',
    );
    expect(screen.getByRole('link', { name: /Share your latest work/ })).toHaveAttribute(
      'href',
      '/portfolio',
    );
    // A talent's last tab is their own page.
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(await within(nav).findByRole('link', { name: 'Profile' })).toHaveAttribute(
      'href',
      '/talents/ngozi.sings',
    );
    expect(within(nav).getByRole('link', { name: 'Discover' })).toHaveAttribute('href', '/search');
    await expectNoAxeViolations();
  });

  it('likes a post at once, and takes the like back', async () => {
    const calls = talentHome({
      'PUT /v1/posts/0192a3b4-0000-7000-8000-000000000001/like': () =>
        Response.json({ liked: true, likes: 5 }),
      'DELETE /v1/posts/0192a3b4-0000-7000-8000-000000000001/like': () =>
        Response.json({ liked: false, likes: 4 }),
    });
    renderAt('/home');
    const user = userEvent.setup({ delay: null });
    const [post] = await screen.findAllByRole('article', { name: 'Post by Tobi Adebayo' });
    if (!post) throw new Error('no post');
    const like = within(post).getByRole('button', { name: "Like Tobi Adebayo's post" });
    expect(like).toHaveAttribute('aria-pressed', 'false');
    await user.click(like);
    expect(like).toHaveAttribute('aria-pressed', 'true');
    expect(await within(post).findByText('5 likes')).toBeVisible();
    await user.click(like);
    expect(await within(post).findByText('4 likes')).toBeVisible();
    expect(calls.filter((call) => call.path.endsWith('/like')).map((call) => call.method)).toEqual([
      'PUT',
      'DELETE',
    ]);
  });

  it('follows someone suggested, and shows the following feed when asked', async () => {
    const calls = talentHome({
      'PUT /v1/talents/zainab.bello/follow': () =>
        Response.json(socialFor({ followers: 1, followedByViewer: true })),
    });
    renderAt('/home');
    const user = userEvent.setup({ delay: null });
    const suggested = await screen.findByRole('region', { name: 'Suggested for you' });
    await user.click(within(suggested).getByRole('button', { name: 'Follow Zainab Bello' }));
    expect(
      await within(suggested).findByRole('button', { name: 'Following Zainab Bello' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Following' }));
    await waitFor(() => {
      expect(calls.filter((call) => call.path === '/v1/feed').at(-1)?.query).toBe(
        '?scope=following',
      );
    });
  });

  it('says how to fill an empty following feed', async () => {
    talentHome(feedRoutes());
    renderAt('/home');
    const user = userEvent.setup({ delay: null });
    expect(await screen.findByText('No posts yet')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Following' }));
    expect(await screen.findByText('Follow talent to see their new work here.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Find people to follow' })).toHaveAttribute(
      'href',
      '/search',
    );
  });

  it("shows no removal control to members: that is the moderator's", async () => {
    talentHome();
    renderAt('/home');
    await screen.findAllByRole('article', { name: 'Post by Tobi Adebayo' });
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
  });

  it('reports a post from the post itself, and never offers that on your own', async () => {
    const calls = talentHome({
      ...feedRoutes([postFor(1), postFor(2, { talent: cardFor('ngozi.sings', 'Ngozi Adeyemi') })]),
      'POST /v1/reports': () => new Response(null, { status: 204 }),
    });
    renderAt('/home');
    const user = userEvent.setup({ delay: null });
    const own = await screen.findByRole('article', { name: 'Post by Ngozi Adeyemi' });
    await waitFor(() => {
      expect(within(own).queryByRole('button', { name: 'Report post' })).toBeNull();
    });
    const post = screen.getByRole('article', { name: 'Post by Tobi Adebayo' });
    await user.click(within(post).getByRole('button', { name: 'Report post' }));
    const form = within(post).getByRole('form', { name: 'Report this post' });
    await user.click(within(form).getByLabelText('Inappropriate photos, video or text'));
    await user.click(within(form).getByRole('button', { name: 'Send report' }));
    expect(
      await within(post).findByText('Thank you. A moderator will look at this post.'),
    ).toBeVisible();
    expect(calls.find((call) => call.path === '/v1/reports')?.body).toEqual({
      subject: { kind: 'post', postId: '0192a3b4-0000-7000-8000-000000000001' },
      category: 'inappropriate_content',
    });
  });

  it('lets an agent search straight from home, or browse a category', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ role: 'agent', status: 'active' })),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations': () => Response.json({ items: [], nextCursor: null }),
      'GET /v1/taxonomy': () => Response.json(TAXONOMY),
      'GET /v1/me/agent-profile': () =>
        Response.json({
          userId: '0192a3b4-0000-7000-8000-000000000001',
          agencyName: 'Eko Talent Partners',
          jobTitle: 'Scout',
          specializations: [],
          city: null,
          website: null,
          bio: '',
          rosterStatus: null,
          avatarMediaId: null,
          avatarUrls: null,
          verified: true,
          isComplete: true,
          missing: [],
          version: 2,
          updatedAt: '2026-10-02T09:00:00.000Z',
        }),
      ...feedRoutes([postFor(1)]),
      'GET /v1/search/talents': () =>
        Response.json({
          items: [],
          total: 0,
          page: 1,
          perPage: 24,
          hasMore: false,
          facets: { categories: [], subcategories: [], countries: [], cities: [] },
        }),
    });
    const router = renderAt('/home');
    const user = userEvent.setup({ delay: null });
    expect(await screen.findByText('Verified agency')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Music' })).toHaveAttribute(
      'href',
      '/search?category=music',
    );
    expect(await screen.findByRole('article', { name: 'Post by Tobi Adebayo' })).toBeVisible();
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
